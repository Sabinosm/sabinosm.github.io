// adminPacienteDetalheLista.js
//
// Orquestra a página de ficha do paciente (adminPacienteDetalhe.html):
//   1. lê o uuid da querystring (?uuid=...)
//   2. busca clínico + pessoal via buscarDetalheCompleto (pede as duas
//      confirmações de step-up necessárias, serializadas -- ver
//      adminPacientesApi.js e a fila em stepup.js)
//   3. preenche header, alertas fixos e as 4 abas
//
// Alertas fixos (patient-alerts): usam resumo_clinico direto da
// resposta do backend -- ele já vem pronto no formato ideal (total,
// tem_grave/ativas/em_uso_continuo, resumo[]), sem precisar computar
// nada aqui. Ficam SEMPRE visíveis, independente de qual aba está
// ativa -- é o ponto central do desenho (alergia grave não pode
// depender de a pessoa clicar na aba certa pra aparecer).
//
// Edição por bloco: os botões "Editar"/"Adicionar" de cada aba
// (Pessoal, Alergias, Medicamentos, Doenças crônicas) existem só
// visualmente por enquanto -- cada um tem um TODO explícito abaixo.
// Nenhum abre formulário nem salva nada ainda; é intencional (ver
// conversa que originou este arquivo: "deve ter o botão, mas não
// precisa estar em funcionamento, só com o design").

import { ApiError, buscarDetalheCompleto } from "./adminPacientesApi.js";
import { ConfirmacaoCanceladaError } from "../../stepup.js";

document.addEventListener('DOMContentLoaded', () => {
  const uuid = new URLSearchParams(window.location.search).get('uuid');

  if (!uuid) {
    mostrarErro('Nenhum paciente informado na URL (parâmetro "uuid" ausente).');
    return;
  }

  configurarAbas();
  configurarBotoesEdicao();
  carregarFicha(uuid);
});

// ============================================
// Carregamento
// ============================================
async function carregarFicha(uuid) {
  try {
    const resultado = await buscarDetalheCompleto(uuid);

    if (!resultado) {
      // Usuário cancelou alguma das confirmações de step-up -- volta
      // pra lista em vez de deixar a página presa num estado vazio,
      // já que sem os dados não há ficha nenhuma pra mostrar.
      window.location.href = 'adminPacientes.html';
      return;
    }

    const clinico = resultado.clinico.data;
    const pessoal = resultado.pessoal.data;

    preencherHeader(clinico, pessoal);
    preencherAlertas(clinico.resumo_clinico);
    preencherPessoal(clinico, pessoal.pessoal);
    preencherAlergias(clinico.alergias ?? []);
    preencherMedicamentos(clinico.medicamentos_em_uso ?? []);
    preencherCronicas(clinico.doencas_cronicas ?? [], clinico.consentimento_ativo);

    document.getElementById('estado-carregando').hidden = true;
    document.getElementById('ficha-paciente').hidden = false;
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) {
      window.location.href = 'adminPacientes.html';
      return;
    }
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os dados do paciente.';
    mostrarErro(mensagem);
  }
}

function mostrarErro(texto) {
  document.getElementById('estado-carregando').hidden = true;
  const estadoErro = document.getElementById('estado-erro');
  estadoErro.hidden = false;
  document.getElementById('estado-erro-texto').textContent = texto;
}

// ============================================
// Header
// ============================================
function iniciais(nomeCompleto) {
  if (!nomeCompleto) return '';
  const partes = nomeCompleto.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}

function calcularIdade(dataNascimentoIso) {
  if (!dataNascimentoIso) return null;
  const nascimento = new Date(dataNascimentoIso);
  if (Number.isNaN(nascimento.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

function preencherHeader(clinico, pessoal) {
  const nome = pessoal.pessoal?.nome_completo ?? '';
  document.getElementById('patient-avatar-iniciais').textContent = iniciais(nome);
  document.getElementById('patient-nome').textContent = nome;

  const idade = calcularIdade(clinico.data_nascimento);
  const partesMeta = [];
  if (idade !== null) partesMeta.push(`${idade} anos`);
  if (clinico.sexo_biologico) partesMeta.push(clinico.sexo_biologico === 'F' ? 'Feminino' : clinico.sexo_biologico === 'M' ? 'Masculino' : clinico.sexo_biologico);
  if (clinico.tipo_sanguineo) partesMeta.push(`Tipo ${clinico.tipo_sanguineo}`);
  document.getElementById('patient-meta').textContent = partesMeta.join(' · ');

  const badge = document.getElementById('patient-status-badge');
  if (clinico.status === 'ativo') {
    badge.className = 'consult-status status--em-atendimento';
    badge.innerHTML = `<span class="status-dot"></span> Ativo`;
  } else if (clinico.status === 'obito') {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Óbito';
  } else {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Inativo';
  }
}

// ============================================
// Alertas clínicos fixos (resumo_clinico)
// ============================================
function preencherAlertas(resumo) {
  const container = document.getElementById('patient-alerts');
  container.innerHTML = '';

  container.appendChild(criarAlertCard({
    titulo: 'Alergias',
    dados: resumo?.alergias,
    critico: Boolean(resumo?.alergias?.tem_grave),
    iconeSvg: `<path d="M12 9v4M12 17h.01" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke-linecap="round"/>`,
    vazio: 'Nenhuma alergia registrada',
  }));

  container.appendChild(criarAlertCard({
    titulo: 'Doenças crônicas',
    dados: resumo?.doencas_cronicas,
    critico: false,
    iconeSvg: `<path d="M4.5 12.5l4 4L20 6" stroke-linecap="round" stroke-linejoin="round"/>`,
    vazio: 'Nenhuma doença crônica registrada',
    sufixoContagem: (d) => d.ativas != null ? `${d.ativas} ativa(s)` : null,
  }));

  container.appendChild(criarAlertCard({
    titulo: 'Medicamentos em uso',
    dados: resumo?.medicamentos_em_uso,
    critico: false,
    iconeSvg: `<rect x="4" y="4" width="16" height="16" rx="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12h6M12 9v6" stroke-linecap="round"/>`,
    vazio: 'Nenhum medicamento em uso registrado',
    sufixoContagem: (d) => d.em_uso_continuo != null ? `${d.em_uso_continuo} contínuo(s)` : null,
  }));
}

function criarAlertCard({ titulo, dados, critico, iconeSvg, vazio, sufixoContagem }) {
  const card = document.createElement('div');
  card.className = critico ? 'alert-card alert-card--critico' : 'alert-card';

  const icone = document.createElement('div');
  icone.className = 'alert-icon';
  icone.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconeSvg}</svg>`;

  const body = document.createElement('div');
  body.className = 'alert-body';

  const total = dados?.total ?? 0;
  const tituloEl = document.createElement('p');
  tituloEl.className = 'alert-title';
  const extra = total > 0 && sufixoContagem ? sufixoContagem(dados) : null;
  tituloEl.textContent = `${titulo} (${total})${extra ? ` · ${extra}` : ''}`;

  const resumoEl = document.createElement('p');
  resumoEl.className = 'alert-summary';
  if (total === 0 || !dados?.resumo?.length) {
    resumoEl.classList.add('alert-empty');
    resumoEl.textContent = vazio;
  } else {
    dados.resumo.forEach(item => {
      const span = document.createElement('span');
      span.className = 'alert-summary-item';
      span.textContent = item;
      resumoEl.appendChild(span);
    });
  }

  body.append(tituloEl, resumoEl);
  card.append(icone, body);
  return card;
}

// ============================================
// Aba Pessoal (gerenciamento + dados pessoais)
// ============================================
const SEXO_LABEL = { F: 'Feminino', M: 'Masculino' };
const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo', obito: 'Óbito' };

function preencherTexto(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  if (valor === null || valor === undefined || valor === '') {
    el.textContent = '';
    el.classList.add('field-readonly--vazio');
  } else {
    el.textContent = valor;
    el.classList.remove('field-readonly--vazio');
  }
}

function preencherPessoal(clinico, pessoal) {
  preencherTexto('pf-view-nome', pessoal?.nome_completo);
  preencherTexto('pf-view-cpf', pessoal?.cpf);
  preencherTexto('pf-view-rg', pessoal?.rg);
  preencherTexto('pf-view-nascimento', formatarData(clinico.data_nascimento));
  preencherTexto('pf-view-sexo', SEXO_LABEL[clinico.sexo_biologico] ?? clinico.sexo_biologico);
  preencherTexto('pf-view-sangue', clinico.tipo_sanguineo);
  preencherTexto('pf-view-telefone', pessoal?.telefone);
  preencherTexto('pf-view-email', pessoal?.email);

  const endereco = [pessoal?.logradouro, pessoal?.numero_residencia].filter(Boolean).join(', ');
  preencherTexto('pf-view-endereco', endereco);
  preencherTexto('pf-view-cep', pessoal?.cep);
  preencherTexto('pf-view-emergencia-nome', pessoal?.contato_emergencia_nome);
  preencherTexto('pf-view-emergencia-telefone', pessoal?.contato_emergencia_telefone);

  preencherTexto('pf-view-status', STATUS_LABEL[clinico.status] ?? clinico.status);
  preencherTexto('pf-view-primeiro-atendimento', formatarData(clinico.data_primeiro_atendimento));
  preencherTexto('pf-view-cadastrado-por', clinico.cadastrado_por);
  preencherTexto('pf-view-criado-em', formatarData(clinico.criado_em));
}

// ============================================
// Aba Alergias
// ============================================
function preencherAlergias(alergias) {
  document.getElementById('count-alergias').textContent = alergias.length || '';
  const container = document.getElementById('lista-alergias');
  container.innerHTML = '';

  if (alergias.length === 0) {
    container.appendChild(criarListaVazia('Nenhuma alergia registrada.'));
    return;
  }

  alergias.forEach(alergia => {
    const card = document.createElement('article');
    card.className = alergia.gravidade === 'grave' ? 'clinical-card clinical-card--grave' : 'clinical-card';

    const top = document.createElement('div');
    top.className = 'clinical-card-top';

    const tituloBloco = document.createElement('div');
    const titulo = document.createElement('p');
    titulo.className = 'clinical-card-title';
    titulo.textContent = alergia.substancia;

    const tags = document.createElement('div');
    tags.className = 'clinical-card-tags';
    tags.appendChild(criarTag(alergia.gravidade, `clinical-tag--${alergia.gravidade}`));
    if (alergia.tipo_reacao) tags.appendChild(criarTag(alergia.tipo_reacao));
    if (alergia.flag_confirmado) tags.appendChild(criarTag('Confirmado'));

    tituloBloco.append(titulo, tags);
    top.appendChild(tituloBloco);

    card.appendChild(top);

    if (alergia.descricao_reacao) {
      const desc = document.createElement('p');
      desc.className = 'clinical-card-desc';
      desc.textContent = alergia.descricao_reacao;
      card.appendChild(desc);
    }

    if (alergia.reacoes?.length) {
      const listaReacoes = document.createElement('div');
      listaReacoes.className = 'reactions-list';
      alergia.reacoes.forEach(r => {
        const item = document.createElement('div');
        item.className = 'reaction-item';
        const esquerda = document.createElement('span');
        esquerda.textContent = `${r.manifestacao ?? ''}${r.gravidade ? ` · ${r.gravidade}` : ''}`;
        const direita = document.createElement('span');
        direita.textContent = formatarData(r.data_ocorrencia);
        item.append(esquerda, direita);
        listaReacoes.appendChild(item);
      });
      card.appendChild(listaReacoes);
    }

    container.appendChild(card);
  });
}

// ============================================
// Aba Medicamentos em uso
// ============================================
function preencherMedicamentos(medicamentos) {
  document.getElementById('count-medicamentos').textContent = medicamentos.length || '';
  const container = document.getElementById('lista-medicamentos');
  container.innerHTML = '';

  if (medicamentos.length === 0) {
    container.appendChild(criarListaVazia('Nenhum medicamento em uso registrado.'));
    return;
  }

  medicamentos.forEach(med => {
    const card = document.createElement('article');
    card.className = 'clinical-card';

    const top = document.createElement('div');
    top.className = 'clinical-card-top';

    const bloco = document.createElement('div');
    const titulo = document.createElement('p');
    titulo.className = 'clinical-card-title';
    titulo.textContent = med.descricao;

    const tags = document.createElement('div');
    tags.className = 'clinical-card-tags';
    if (med.status_uso) tags.appendChild(criarTag(med.status_uso, `clinical-tag--${med.status_uso}`));
    if (med.flag_em_uso) tags.appendChild(criarTag('Em uso'));

    bloco.append(titulo, tags);
    top.appendChild(bloco);
    card.appendChild(top);

    const meta = document.createElement('p');
    meta.className = 'clinical-card-meta';
    const partes = [];
    if (med.dose) partes.push(`<strong>Dose:</strong> ${med.dose}`);
    if (med.frequencia) partes.push(`<strong>Frequência:</strong> ${med.frequencia}`);
    if (med.desde) partes.push(`<strong>Desde:</strong> ${formatarData(med.desde)}`);
    meta.innerHTML = partes.join(' &nbsp;·&nbsp; ');
    card.appendChild(meta);

    container.appendChild(card);
  });
}

// ============================================
// Aba Doenças crônicas
// ============================================
function preencherCronicas(doencas, consentimentoAtivo) {
  document.getElementById('count-cronicas').textContent = doencas.length || '';
  const container = document.getElementById('lista-cronicas');
  container.innerHTML = '';

  if (doencas.length === 0) {
    container.appendChild(criarListaVazia('Nenhuma doença crônica registrada.'));
  } else {
    doencas.forEach(doenca => {
      const card = document.createElement('article');
      card.className = 'clinical-card';

      const top = document.createElement('div');
      top.className = 'clinical-card-top';

      const bloco = document.createElement('div');
      const titulo = document.createElement('p');
      titulo.className = 'clinical-card-title';
      titulo.textContent = doenca.descricao_cid10 || doenca.codigo_cid10;

      const tags = document.createElement('div');
      tags.className = 'clinical-card-tags';
      if (doenca.codigo_cid10) tags.appendChild(criarTag(doenca.codigo_cid10));
      if (doenca.status) tags.appendChild(criarTag(doenca.status, `clinical-tag--${doenca.status}`));

      bloco.append(titulo, tags);
      top.appendChild(bloco);
      card.appendChild(top);

      if (doenca.observacoes) {
        const desc = document.createElement('p');
        desc.className = 'clinical-card-desc';
        desc.textContent = doenca.observacoes;
        card.appendChild(desc);
      }

      const meta = document.createElement('p');
      meta.className = 'clinical-card-meta';
      meta.innerHTML = doenca.desde ? `<strong>Desde:</strong> ${formatarData(doenca.desde)}` : '';
      card.appendChild(meta);

      container.appendChild(card);
    });
  }

  const banner = document.getElementById('consent-banner');
  const texto = document.getElementById('consent-banner-texto');
  banner.classList.toggle('consent-banner--ausente', !consentimentoAtivo);
  texto.textContent = consentimentoAtivo
    ? 'Paciente com consentimento ativo para uso destes dados clínicos.'
    : 'Paciente SEM consentimento ativo registrado para uso destes dados clínicos.';
}

// ============================================
// Helpers de UI compartilhados entre abas clínicas
// ============================================
function criarTag(texto, classeExtra) {
  const tag = document.createElement('span');
  tag.className = classeExtra ? `clinical-tag ${classeExtra}` : 'clinical-tag';
  tag.textContent = texto;
  return tag;
}

function criarListaVazia(texto) {
  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.style.padding = '12px 0';
  p.textContent = texto;
  return p;
}

// ============================================
// Abas
// ============================================
function configurarAbas() {
  const botoes = document.querySelectorAll('.patient-tab');
  botoes.forEach(botao => {
    botao.addEventListener('click', () => {
      const alvo = botao.dataset.tab;

      botoes.forEach(b => b.classList.toggle('patient-tab--active', b === botao));

      document.querySelectorAll('.patient-panel').forEach(painel => {
        painel.classList.toggle('patient-panel--active', painel.id === `painel-${alvo}`);
      });
    });
  });
}

// ============================================
// Botões de edição/adição por bloco -- só design por enquanto.
//
// TODO (edição por bloco, ainda não implementada):
//   - #btn-editar-pessoal      -> abrir formulário editável dos dados
//     pessoais (provavelmente um modal nos moldes de
//     adminProfissionaisModal.js), PUT /pacientes/pessoal/<uuid>
//     (endpoint de escrita ainda não confirmado).
//   - #btn-editar-alergias     -> abrir formulário para
//     adicionar/editar uma alergia (substancia, tipo_reacao,
//     gravidade, descricao_reacao, reacoes[]).
//   - #btn-editar-medicamentos -> abrir formulário para
//     adicionar/editar um medicamento em uso (descricao, dose,
//     frequencia, desde, status_uso).
//   - #btn-editar-cronicas     -> abrir formulário para
//     adicionar/editar uma doença crônica (codigo_cid10, desde,
//     status, observacoes).
// Cada uma dessas ações de escrita provavelmente também precisa de
// step-up próprio (acao_sensivel), já que são write -- não reusar o
// token de visualizar_paciente, que é de uso único e já foi
// consumido no carregamento da página.
// ============================================
function configurarBotoesEdicao() {
  const acoes = [
    ['btn-editar-pessoal', 'Editar dados pessoais'],
    ['btn-editar-alergias', 'Adicionar/editar alergia'],
    ['btn-editar-medicamentos', 'Adicionar/editar medicamento em uso'],
    ['btn-editar-cronicas', 'Adicionar/editar doença crônica'],
  ];

  acoes.forEach(([id, label]) => {
    const botao = document.getElementById(id);
    botao?.addEventListener('click', () => {
      console.log(`TODO: ${label} -- ainda não implementado.`);
    });
  });
}