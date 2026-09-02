// adminPacientesCriacao.js
//
// Orquestra o formulário de criação de paciente
// (adminPacientesCriacao.html):
//   1. Essencial          -> valida localmente, não bate na API ainda
//   2. Consentimento      -> POST /pacientes/pessoal/ seguido de POST
//                             .../consentimentos (ou .../dispensar-emergencia)
//   3. Transição           -> "paciente criado, adicionar dados clínicos?"
//   4. Dados clínicos      -> (opcional) N alergias, N medicamentos, N
//                             doenças crônicas, 1 tipo sanguíneo -- cada
//                             item é seu PRÓPRIO POST (não existe um
//                             endpoint de criação em lote), então isso
//                             é uma fila de requisições sequenciais com
//                             estado por item (pendente/salvando/
//                             salvo/erro).
//
// Único fluxo de criação, pensado para ser usado tanto em "Pacientes"
// quanto embutido dentro de uma consulta -- por isso os campos do
// passo Essencial ficam restritos ao mínimo (nome, CPF, telefone,
// sexo, nascimento), com o resto (endereço, contato de emergência)
// atrás de um <details> opcional.
//
// IMPORTANTE sobre o passo 4: uma vez que o paciente é criado (fim do
// passo 2), ele já existe de forma válida e utilizável -- os dados
// clínicos são estritamente opcionais e best-effort. Por isso, se o
// profissional abandonar a página no meio do passo 4, nada é perdido:
// os itens que já foram salvos (status 'salvo') continuam no
// paciente; os que não foram enviados só não existem ainda, e podem
// ser adicionados depois pela ficha.

import {
  ApiError,
  criarPacientePessoal,
  registrarConsentimento,
  dispensarConsentimentoEmergencia,
  criarAlergia,
  criarDoencaCronica,
  criarMedicamentoEmUso,
  registrarTipoSanguineo,
  TIPOS_REACAO_ALERGIA,
  GRAVIDADES_ALERGIA,
  STATUS_DOENCA_CRONICA,
  STATUS_USO_MEDICAMENTO,
} from "./adminPacientesApi.js";
import { validarEssencial } from "./adminPacientesCriacaoValidacoes.js";
import { exibirMensagem } from "/js/shared/feedback.js";

let modoConsentimento = 'normal'; // 'normal' | 'emergencia'
let enviando = false;
let pacienteUuid = null; // preenchido assim que o passo 2 conclui

let itensAlergia = [];
let itensMedicamento = [];
let itensCronica = [];
let proximoIdLocal = 1;

document.addEventListener('DOMContentLoaded', () => {
  configurarNavegacaoPassos();
  configurarToggleConsentimento();
  configurarSubmissaoCadastro();
  configurarTransicao();
  configurarDadosClinicos();
});

function configurarNavegacaoPassos() {
  document.getElementById('btn-avancar-consentimento').addEventListener('click', () => {
    const { erros } = validarEssencial(lerCamposEssencial());
    limparErros(['pac-nome', 'pac-cpf', 'pac-telefone', 'pac-sexo', 'pac-nascimento']);

    if (Object.keys(erros).length > 0) {
      aplicarErros(erros);
      exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
      return;
    }

    limparFeedback();
    irParaPasso('consentimento');
  });

  document.getElementById('btn-voltar-essencial').addEventListener('click', () => {
    limparFeedback();
    irParaPasso('essencial');
  });
}

function irParaPasso(passo) {
  const paineis = ['essencial', 'consentimento', 'transicao', 'clinico'];
  paineis.forEach(p => {
    document.getElementById(`painel-${p}`).classList.toggle('creation-panel--active', p === passo);
  });

  const marcoAtivo = passo === 'transicao' ? 'clinico' : passo;
  const indicadores = { essencial: 1, consentimento: 2, clinico: 3 };
  Object.entries(indicadores).forEach(([nome, numero]) => {
    const el = document.getElementById(`step-indicator-${nome}`);
    el.classList.toggle('creation-step--active', nome === marcoAtivo);
    el.classList.toggle('creation-step--concluido', indicadores[marcoAtivo] > numero);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function configurarToggleConsentimento() {
  const btnNormal = document.getElementById('btn-modo-normal');
  const btnEmergencia = document.getElementById('btn-modo-emergencia');
  const blocoNormal = document.getElementById('bloco-consentimento-normal');
  const blocoEmergencia = document.getElementById('bloco-consentimento-emergencia');

  function selecionar(modo) {
    modoConsentimento = modo;
    btnNormal.classList.toggle('consent-mode-option--active', modo === 'normal');
    btnEmergencia.classList.toggle('consent-mode-option--active', modo === 'emergencia');
    blocoNormal.style.display = modo === 'normal' ? '' : 'none';
    blocoEmergencia.classList.toggle('consent-emergencia-box--visivel', modo === 'emergencia');
  }

  btnNormal.addEventListener('click', () => selecionar('normal'));
  btnEmergencia.addEventListener('click', () => selecionar('emergencia'));

  selecionar('normal');
}

function lerCamposEssencial() {
  return {
    nome: document.getElementById('pac-nome').value.trim(),
    cpf: document.getElementById('pac-cpf').value.trim(),
    telefone: document.getElementById('pac-telefone').value.trim(),
    sexoBiologico: document.getElementById('pac-sexo').value,
    dataNascimento: document.getElementById('pac-nascimento').value,
    email: document.getElementById('pac-email').value.trim(),
    logradouro: document.getElementById('pac-logradouro').value.trim(),
    numeroResidencia: document.getElementById('pac-numero').value.trim(),
    cep: document.getElementById('pac-cep').value.trim(),
    contatoEmergenciaNome: document.getElementById('pac-emergencia-nome').value.trim(),
    contatoEmergenciaTelefone: document.getElementById('pac-emergencia-telefone').value.trim(),
  };
}

function configurarSubmissaoCadastro() {
  document.getElementById('btn-criar-paciente').addEventListener('click', criarPacienteEConsentimento);
}

async function criarPacienteEConsentimento() {
  if (enviando) return;

  const { payload: payloadEssencial, erros } = validarEssencial(lerCamposEssencial());
  if (Object.keys(erros).length > 0) {
    irParaPasso('essencial');
    aplicarErros(erros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  let motivoEmergencia = '';
  if (modoConsentimento === 'emergencia') {
    motivoEmergencia = document.getElementById('pac-motivo-emergencia').value.trim();
    limparErros(['pac-motivo-emergencia']);
    if (!motivoEmergencia) {
      document.getElementById('pac-motivo-emergencia-error').textContent = 'Descreva o motivo da dispensa.';
      document.getElementById('pac-motivo-emergencia').closest('.field-group').classList.add('field-group--has-error');
      exibirMensagem('Informe a justificativa para dispensar o consentimento.', 'erro');
      return;
    }
  }

  enviando = true;
  const btn = document.getElementById('btn-criar-paciente');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Salvando…';
  limparFeedback();

  try {
    const respostaPaciente = await criarPacientePessoal(payloadEssencial);
    const uuid = respostaPaciente?.data?.uuid;
    if (!uuid) throw new ApiError('O paciente foi criado, mas a resposta não trouxe o identificador esperado.', 0);

    if (modoConsentimento === 'emergencia') {
      await dispensarConsentimentoEmergencia(uuid, motivoEmergencia);
    } else {
      const versaoTermo = document.getElementById('pac-versao-termo').value.trim() || 'v2.1';
      const canalColeta = document.getElementById('pac-canal-coleta').value;
      await registrarConsentimento(uuid, { versao_termo: versaoTermo, canal_coleta: canalColeta });
    }

    pacienteUuid = uuid;
    irParaPasso('transicao');
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível concluir o cadastro do paciente.';
    exibirMensagem(mensagem, 'erro');
  } finally {
    enviando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function configurarTransicao() {
  document.getElementById('btn-pular-clinico').addEventListener('click', irParaFicha);
  document.getElementById('btn-adicionar-clinico').addEventListener('click', () => irParaPasso('clinico'));
}

function irParaFicha() {
  window.location.href = `adminPacientesDetalhe.html?uuid=${encodeURIComponent(pacienteUuid)}`;
}

function configurarDadosClinicos() {
  document.getElementById('btn-add-alergia').addEventListener('click', () => adicionarItem('alergia'));
  document.getElementById('btn-add-medicamento').addEventListener('click', () => adicionarItem('medicamento'));
  document.getElementById('btn-add-cronica').addEventListener('click', () => adicionarItem('cronica'));

  document.getElementById('btn-pular-clinico-2').addEventListener('click', irParaFicha);
  document.getElementById('btn-salvar-clinico').addEventListener('click', salvarDadosClinicos);
}

const CONFIG_ITEM = {
  alergia: {
    lista: () => itensAlergia,
    container: 'lista-form-alergias',
    vazio: 'alergias-vazio',
    contagem: 'contagem-alergias',
    titulo: 'Alergia',
    criarFormulario: criarFormularioAlergia,
    lerPayload: lerPayloadAlergia,
    enviar: (payload) => criarAlergia(pacienteUuid, payload),
  },
  medicamento: {
    lista: () => itensMedicamento,
    container: 'lista-form-medicamentos',
    vazio: 'medicamentos-vazio',
    contagem: 'contagem-medicamentos',
    titulo: 'Medicamento',
    criarFormulario: criarFormularioMedicamento,
    lerPayload: lerPayloadMedicamento,
    enviar: (payload) => criarMedicamentoEmUso(pacienteUuid, payload),
  },
  cronica: {
    lista: () => itensCronica,
    container: 'lista-form-cronicas',
    vazio: 'cronicas-vazio',
    contagem: 'contagem-cronicas',
    titulo: 'Doença crônica',
    criarFormulario: criarFormularioCronica,
    lerPayload: lerPayloadCronica,
    enviar: (payload) => criarDoencaCronica(pacienteUuid, payload),
  },
};

function adicionarItem(tipo) {
  const cfg = CONFIG_ITEM[tipo];
  const id = proximoIdLocal++;
  const item = { id, status: 'pendente', erro: null };
  cfg.lista().push(item);

  const container = document.getElementById(cfg.container);
  const elemento = cfg.criarFormulario(item);
  elemento.dataset.itemId = String(id);
  container.appendChild(elemento);

  atualizarContadoresVazio(tipo);
}

function removerItem(tipo, id) {
  const cfg = CONFIG_ITEM[tipo];
  const lista = cfg.lista();
  const indice = lista.findIndex(i => i.id === id);
  if (indice === -1) return;
  lista.splice(indice, 1);

  const container = document.getElementById(cfg.container);
  const elemento = container.querySelector(`[data-item-id="${id}"]`);
  elemento?.remove();

  atualizarContadoresVazio(tipo);
}

function atualizarContadoresVazio(tipo) {
  const cfg = CONFIG_ITEM[tipo];
  const lista = cfg.lista();
  document.getElementById(cfg.vazio).style.display = lista.length === 0 ? '' : 'none';
  document.getElementById(cfg.contagem).textContent = lista.length > 0 ? `${lista.length} adicionado(s)` : '';
}

function criarCabecalhoItem(tipo, item, numero) {
  const cfg = CONFIG_ITEM[tipo];
  const top = document.createElement('div');
  top.className = 'dynamic-item-top';

  const titulo = document.createElement('span');
  titulo.className = 'dynamic-item-title';
  titulo.textContent = `${cfg.titulo} ${numero}`;

  const acoes = document.createElement('div');
  acoes.style.display = 'flex';
  acoes.style.alignItems = 'center';
  acoes.style.gap = '10px';

  const status = document.createElement('span');
  status.className = 'dynamic-item-status';
  status.dataset.role = 'status';

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'dynamic-item-remove';
  remover.setAttribute('aria-label', `Remover ${cfg.titulo.toLowerCase()}`);
  remover.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  remover.addEventListener('click', () => removerItem(tipo, item.id));

  acoes.append(status, remover);
  top.append(titulo, acoes);
  return top;
}

function atualizarStatusVisual(tipo, item) {
  const cfg = CONFIG_ITEM[tipo];
  const elemento = document.getElementById(cfg.container).querySelector(`[data-item-id="${item.id}"]`);
  if (!elemento) return;

  elemento.classList.remove('dynamic-item--salvo', 'dynamic-item--erro');
  const statusEl = elemento.querySelector('[data-role="status"]');
  const erroEl = elemento.querySelector('[data-role="erro-texto"]');

  statusEl.className = 'dynamic-item-status';
  if (item.status === 'salvando') {
    statusEl.classList.add('dynamic-item-status--salvando');
    statusEl.textContent = 'Salvando…';
  } else if (item.status === 'salvo') {
    elemento.classList.add('dynamic-item--salvo');
    statusEl.classList.add('dynamic-item-status--salvo');
    statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvo`;
  } else if (item.status === 'erro') {
    elemento.classList.add('dynamic-item--erro');
    statusEl.classList.add('dynamic-item-status--erro');
    statusEl.textContent = 'Erro';
  } else {
    statusEl.textContent = '';
  }

  if (erroEl) erroEl.textContent = item.status === 'erro' ? (item.erro || 'Não foi possível salvar.') : '';

  elemento.querySelectorAll('input, select, textarea').forEach(campo => {
    campo.disabled = item.status === 'salvo' || item.status === 'salvando';
  });
}

function criarFormularioAlergia(item) {
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  const numero = itensAlergia.length;
  div.appendChild(criarCabecalhoItem('alergia', item, numero));

  div.insertAdjacentHTML('beforeend', `
    <div class="field-group" style="max-width:none;">
      <label class="field-label">Substância</label>
      <input class="field-input" type="text" data-campo="substancia" placeholder="Ex: Penicilina">
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Tipo de reação</label>
        <select class="field-input" data-campo="tipo_reacao">
          <option value="">Selecione</option>
          ${TIPOS_REACAO_ALERGIA.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="field-group">
        <label class="field-label">Gravidade</label>
        <select class="field-input" data-campo="gravidade">
          <option value="">Selecione</option>
          ${GRAVIDADES_ALERGIA.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-group" style="max-width:none;">
      <label class="field-label">Descrição da reação <span class="field-optional">(opcional)</span></label>
      <textarea class="field-input" data-campo="descricao_reacao" placeholder="Ex: Reação anafilática, necessitou epinefrina"></textarea>
    </div>
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-muted); margin-top:4px;">
      <input type="checkbox" data-campo="flag_confirmado">
      Alergia confirmada (não só suspeita)
    </label>
    <p class="dynamic-item-error-text" data-role="erro-texto"></p>
  `);

  return div;
}

function lerPayloadAlergia(elemento) {
  const substancia = elemento.querySelector('[data-campo="substancia"]').value.trim();
  const tipoReacao = elemento.querySelector('[data-campo="tipo_reacao"]').value;
  const gravidade = elemento.querySelector('[data-campo="gravidade"]').value;
  const descricao = elemento.querySelector('[data-campo="descricao_reacao"]').value.trim();
  const confirmado = elemento.querySelector('[data-campo="flag_confirmado"]').checked;

  if (!substancia) return { erro: 'Informe a substância.' };
  if (!tipoReacao) return { erro: 'Selecione o tipo de reação.' };
  if (!gravidade) return { erro: 'Selecione a gravidade.' };

  const payload = { substancia, tipo_reacao: tipoReacao, gravidade, flag_confirmado: confirmado };
  if (descricao) payload.descricao_reacao = descricao;
  return { payload };
}

function criarFormularioMedicamento(item) {
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  const numero = itensMedicamento.length;
  div.appendChild(criarCabecalhoItem('medicamento', item, numero));

  div.insertAdjacentHTML('beforeend', `
    <div class="field-group" style="max-width:none;">
      <label class="field-label">Medicamento (catálogo)</label>
      <input class="field-input" type="text" data-campo="id_catalogo" inputmode="numeric" placeholder="ID do catálogo -- TODO: trocar por busca/autocomplete">
      <p class="field-hint">Campo temporário: ainda não há busca no catálogo real de medicamentos. Informe o ID numérico conhecido.</p>
    </div>
    <div class="field-group" style="max-width:none;">
      <label class="field-label">Descrição</label>
      <input class="field-input" type="text" data-campo="descricao" placeholder="Ex: Losartana 50mg">
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Dose <span class="field-optional">(opcional)</span></label>
        <input class="field-input" type="text" data-campo="dose" placeholder="Ex: 1 comprimido">
      </div>
      <div class="field-group">
        <label class="field-label">Frequência <span class="field-optional">(opcional)</span></label>
        <input class="field-input" type="text" data-campo="frequencia" placeholder="Ex: 1x ao dia">
      </div>
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Em uso desde <span class="field-optional">(opcional)</span></label>
        <input class="field-input" type="date" data-campo="desde">
      </div>
      <div class="field-group">
        <label class="field-label">Status de uso <span class="field-optional">(opcional)</span></label>
        <select class="field-input" data-campo="status_uso">
          <option value="">Derivar de "em uso"</option>
          ${STATUS_USO_MEDICAMENTO.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-muted); margin-top:4px;">
      <input type="checkbox" data-campo="flag_em_uso" checked>
      Em uso atualmente
    </label>
    <p class="dynamic-item-error-text" data-role="erro-texto"></p>
  `);

  return div;
}

function lerPayloadMedicamento(elemento) {
  const idCatalogoTexto = elemento.querySelector('[data-campo="id_catalogo"]').value.trim();
  const descricao = elemento.querySelector('[data-campo="descricao"]').value.trim();
  const dose = elemento.querySelector('[data-campo="dose"]').value.trim();
  const frequencia = elemento.querySelector('[data-campo="frequencia"]').value.trim();
  const desde = elemento.querySelector('[data-campo="desde"]').value;
  const statusUso = elemento.querySelector('[data-campo="status_uso"]').value;
  const emUso = elemento.querySelector('[data-campo="flag_em_uso"]').checked;

  const idCatalogo = Number(idCatalogoTexto);
  if (!idCatalogoTexto || !Number.isInteger(idCatalogo) || idCatalogo <= 0) {
    return { erro: 'Informe o ID do catálogo (número inteiro maior que zero).' };
  }
  if (!descricao) return { erro: 'Informe a descrição do medicamento.' };

  const payload = { id_catalogo: idCatalogo, descricao, flag_em_uso: emUso };
  if (dose) payload.dose = dose;
  if (frequencia) payload.frequencia = frequencia;
  if (desde) payload.desde = desde;
  if (statusUso) payload.status_uso = statusUso;
  return { payload };
}

function criarFormularioCronica(item) {
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  const numero = itensCronica.length;
  div.appendChild(criarCabecalhoItem('cronica', item, numero));

  div.insertAdjacentHTML('beforeend', `
    <div class="field-row">
      <div class="field-group field-group--sm">
        <label class="field-label">CID-10</label>
        <input class="field-input" type="text" data-campo="codigo_cid10" placeholder="Ex: I10">
      </div>
      <div class="field-group">
        <label class="field-label">Descrição</label>
        <input class="field-input" type="text" data-campo="descricao_cid10" placeholder="Ex: Hipertensão essencial">
      </div>
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Desde</label>
        <input class="field-input" type="date" data-campo="desde">
      </div>
      <div class="field-group">
        <label class="field-label">Status</label>
        <select class="field-input" data-campo="status">
          <option value="">Selecione</option>
          ${STATUS_DOENCA_CRONICA.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-group" style="max-width:none;">
      <label class="field-label">Observações <span class="field-optional">(opcional)</span></label>
      <textarea class="field-input" data-campo="observacoes" placeholder="Ex: Controlada com medicação"></textarea>
    </div>
    <p class="dynamic-item-error-text" data-role="erro-texto"></p>
  `);

  return div;
}

function lerPayloadCronica(elemento) {
  const cid = elemento.querySelector('[data-campo="codigo_cid10"]').value.trim();
  const descricao = elemento.querySelector('[data-campo="descricao_cid10"]').value.trim();
  const desde = elemento.querySelector('[data-campo="desde"]').value;
  const status = elemento.querySelector('[data-campo="status"]').value;
  const observacoes = elemento.querySelector('[data-campo="observacoes"]').value.trim();

  if (!cid) return { erro: 'Informe o código CID-10.' };
  if (!descricao) return { erro: 'Informe a descrição do CID-10.' };
  if (!desde) return { erro: 'Informe desde quando (obrigatório para doença crônica).' };
  if (!status) return { erro: 'Selecione o status.' };

  const payload = { codigo_cid10: cid, descricao_cid10: descricao, desde, status };
  if (observacoes) payload.observacoes = observacoes;
  return { payload };
}

async function salvarDadosClinicos() {
  if (enviando) return;
  enviando = true;

  const btn = document.getElementById('btn-salvar-clinico');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Salvando…';
  limparFeedback();

  const tiposComItens = ['alergia', 'medicamento', 'cronica'];
  let houveErro = false;

  for (const tipo of tiposComItens) {
    const cfg = CONFIG_ITEM[tipo];
    for (const item of cfg.lista()) {
      if (item.status === 'salvo') continue;

      const elemento = document.getElementById(cfg.container).querySelector(`[data-item-id="${item.id}"]`);
      const { payload, erro: erroLeitura } = cfg.lerPayload(elemento);

      if (erroLeitura) {
        item.status = 'erro';
        item.erro = erroLeitura;
        atualizarStatusVisual(tipo, item);
        houveErro = true;
        continue;
      }

      item.status = 'salvando';
      atualizarStatusVisual(tipo, item);

      try {
        await cfg.enviar(payload);
        item.status = 'salvo';
        item.erro = null;
      } catch (erro) {
        item.status = 'erro';
        item.erro = erro instanceof ApiError ? erro.message : 'Não foi possível salvar este item.';
        houveErro = true;
      }
      atualizarStatusVisual(tipo, item);
    }
  }

  const selectSangue = document.getElementById('clin-tipo-sanguineo');
  const statusSangue = document.getElementById('status-tipo-sanguineo');
  if (selectSangue.value && !selectSangue.dataset.salvo) {
    statusSangue.textContent = 'Salvando…';
    statusSangue.className = 'dynamic-item-status dynamic-item-status--salvando';
    try {
      await registrarTipoSanguineo(pacienteUuid, selectSangue.value);
      selectSangue.dataset.salvo = 'true';
      selectSangue.disabled = true;
      statusSangue.textContent = 'Salvo';
      statusSangue.className = 'dynamic-item-status dynamic-item-status--salvo';
    } catch (erro) {
      houveErro = true;
      const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível salvar o tipo sanguíneo.';
      statusSangue.textContent = mensagem;
      statusSangue.className = 'dynamic-item-status dynamic-item-status--erro';
    }
  }

  enviando = false;
  btn.disabled = false;
  btn.textContent = textoOriginal;

  if (houveErro) {
    exibirMensagem('Alguns itens não puderam ser salvos. Corrija-os e tente novamente, ou vá para a ficha mesmo assim.', 'erro');
    return;
  }

  irParaFicha();
}

function aplicarErros(erros) {
  Object.entries(erros).forEach(([id, mensagem]) => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = mensagem;
    const grupo = input?.closest('.field-group');
    grupo?.classList.add('field-group--has-error');
  });
}

function limparErros(ids) {
  ids.forEach(id => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = '';
    const grupo = input?.closest('.field-group');
    grupo?.classList.remove('field-group--has-error');
  });
}

function limparFeedback() {
  exibirMensagem('', '');
}