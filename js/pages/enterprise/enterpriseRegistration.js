// enterpriseRegistration.js
//
// Passo 1 de 2 do fluxo "Junte-se a nós": cadastro da empresa.
// O backend só persiste empresa+admin juntos (POST /empresa/create),
// então este passo NÃO cria a empresa sozinho -- ele apenas:
//   1. valida os campos localmente (validation.js)
//   2. confere no backend se o CNPJ e/ou o CNES já existem
//      (GET /empresas/existe-cnpj/<cnpj> e /empresas/existe-cnes/<cnes>).
//      Basta informar CNPJ OU CNES -- pelo menos um é obrigatório.
//   3. se estiver livre, guarda os dados da empresa em sessionStorage
//      e navega para adminRegistration.html
//   4. o passo 2 lê os dados da empresa do sessionStorage e, ao
//      concluir, envia tudo junto (empresa + admin) para POST /create
//
// Autopreenchimento (todas as consultas são opcionais e nunca bloqueiam
// o cadastro -- os campos continuam editáveis manualmente):
//   - CNPJ (14 dígitos) -> BrasilAPI: razão social, fantasia, endereço
//   - CEP  (8 dígitos)  -> ViaCEP: bairro
//   - CNES (7 dígitos)  -> API de Dados Abertos do Ministério da Saúde:
//                          razão social, fantasia, CEP, bairro, número
//                          (e o CNPJ, quando o estabelecimento tiver um)

const CHAVE_SESSION_EMPRESA = 'bion_cadastro_empresa';
// Tempo de vida dos dados guardados no sessionStorage. Passado isso,
// consideramos "velhos" (ex: aba esquecida aberta) e mandamos o
// usuário reiniciar o passo 1 em vez de seguir com dados obsoletos.
const TTL_SESSION_EMPRESA_MS = 30 * 60 * 1000; // 30 minutos

const URL_API_CNES = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';

import { exibirMensagem } from "../../shared/feedback.js";
import { validarFormularioEmpresa, ligarValidacaoEmTempoReal, setError } from "./enterpriseValidation.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

// ── máscaras ─────────────────────────────────
function mascararCnpj(valor) {
  let v = String(valor).replace(/\D/g, '').slice(0, 14);
  v = v.replace(/(\d{2})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1/$2');
  v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  return v;
}

document.getElementById('cnpj').addEventListener('input', function (e) {
  e.target.value = mascararCnpj(e.target.value);
});

document.getElementById('cep').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  e.target.value = v;
});

// CNES: apenas dígitos (7 no máximo)
document.getElementById('cnes').addEventListener('input', function (e) {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 7);
});

// ── validação em tempo real (formato, tamanho, caracteres) ───
ligarValidacaoEmTempoReal();

// ── restauração vinda do passo 2 ─────────────
//
// Se o servidor recusou algo da empresa no POST /create, o passo 2
// devolve o usuário para cá gravando no sessionStorage { dados, salvoEm,
// erros }. Aqui restauramos os campos (sem disparar os autopreenchimentos,
// já que setar .value não gera evento 'input') e pintamos cada erro no
// campo certo. O registro é CONSUMIDO (apagado) já na leitura: o form
// passa a ser a fonte dos dados, e o submit grava de novo ao avançar --
// assim nada fica parado no sessionStorage se o usuário desistir aqui.
(function restaurarDadosDoPasso2() {
  let registro = null;
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSION_EMPRESA);
    registro = bruto ? JSON.parse(bruto) : null;
  } catch (erro) {
    console.error('Erro ao ler dados da empresa do sessionStorage:', erro);
  }
  try {
    sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
  } catch (_) { /* sem storage: segue sem restaurar */ }

  if (!registro || !registro.dados || !registro.salvoEm) return;
  if (Date.now() - registro.salvoEm > TTL_SESSION_EMPRESA_MS) return;

  const dados = registro.dados;
  ['cnpj', 'cnes', 'nome_fantasia', 'razao_social', 'cep', 'bairro', 'numero', 'complemento']
    .forEach((id) => {
      if (dados[id] != null) document.getElementById(id).value = dados[id];
    });

  document.querySelectorAll('input[name="plano"]').forEach((radio) => {
    radio.checked = radio.value === dados.plano;
  });

  const erros = registro.erros && typeof registro.erros === 'object' ? registro.erros : {};
  const camposComErro = Object.keys(erros).filter((id) => document.getElementById(id));
  camposComErro.forEach((id) => setError(id, String(erros[id])));

  if (camposComErro.length > 0) {
    document.getElementById(camposComErro[0]).focus();
    exibirMensagem('O servidor recusou alguns dados da empresa. Corrija os campos destacados.', 'erro');
  }
})();

// ── autopreenchimento ────────────────────────

// Contador de consultas ativas por campo. Várias consultas (CNES -> CNPJ,
// CEP, etc.) podem mexer no mesmo campo ao mesmo tempo; o spinner só
// some quando a ÚLTIMA delas termina. Todo setFieldLoading(id, true)
// precisa de um setFieldLoading(id, false) correspondente (no finally).
const consultasAtivasPorCampo = {};

function setFieldLoading(fieldId, isLoading) {
  const field = document.getElementById(fieldId).closest('.field');
  const atual = consultasAtivasPorCampo[fieldId] || 0;
  const novo = Math.max(0, atual + (isLoading ? 1 : -1));
  consultasAtivasPorCampo[fieldId] = novo;
  field.classList.toggle('is-loading', novo > 0);
}

// Formata o CEP puro-dígitos ("01311902" ou "27910000") para o mesmo
// formato que a máscara do campo produz ("01311-902"), já que o input
// de CEP espera esse padrão (ver máscara no topo do arquivo).
function formatarCep(cepBruto) {
  const digits = String(cepBruto || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return '';
  return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

const CAMPOS_AUTOPREENCHIDOS_POR_CNPJ = [
  'razao_social',
  'nome_fantasia',
  'bairro',
  'numero',
  'complemento',
  'cep',
];

const CAMPOS_AUTOPREENCHIDOS_POR_CNES = [
  'cnpj',
  'razao_social',
  'nome_fantasia',
  'bairro',
  'numero',
  'cep',
];

async function buscarDadosCnpj(cnpjLimpo) {
  setFieldLoading('cnpj', true);
  CAMPOS_AUTOPREENCHIDOS_POR_CNPJ.forEach((id) => setFieldLoading(id, true));
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);

    if (!resp.ok) {
      // 404: CNPJ não encontrado na base. 429: rate limit da BrasilAPI.
      // Em ambos os casos não bloqueamos o cadastro -- os campos
      // continuam editáveis manualmente.
      console.warn(`Consulta de CNPJ retornou status ${resp.status}`);
      return;
    }

    const dados = await resp.json();

    // Sempre atualiza quando o CNPJ é completado -- se o usuário trocar
    // o CNPJ digitado, os campos abaixo devem refletir o novo CNPJ, e
    // não ficar travados no valor da consulta anterior.
    document.getElementById('razao_social').value = dados.razao_social || '';
    document.getElementById('nome_fantasia').value = dados.nome_fantasia || '';
    document.getElementById('bairro').value = dados.bairro || '';
    document.getElementById('numero').value = dados.numero || '';
    document.getElementById('complemento').value = dados.complemento || '';

    // CEP: formata para o padrão da máscara do campo. Setar o campo
    // via .value não dispara 'input', então o listener que aciona o
    // ViaCEP não entra em conflito aqui -- o bairro já veio da própria
    // BrasilAPI acima.
    const cepFormatado = formatarCep(dados.cep);
    if (cepFormatado) {
      document.getElementById('cep').value = cepFormatado;
    }
  } catch (erro) {
    console.error('Erro ao consultar CNPJ:', erro);
  } finally {
    setFieldLoading('cnpj', false);
    CAMPOS_AUTOPREENCHIDOS_POR_CNPJ.forEach((id) => setFieldLoading(id, false));
  }
}

async function buscarDadosCep(cepLimpo) {
  setFieldLoading('cep', true);
  setFieldLoading('bairro', true);
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);

    if (!resp.ok) {
      console.warn(`Consulta de CEP retornou status ${resp.status}`);
      return;
    }

    const dados = await resp.json();

    // ViaCEP responde 200 mesmo para CEP inexistente, sinalizando via
    // { erro: true } no corpo -- por isso o check é no JSON, não no status.
    if (dados.erro) {
      console.warn('CEP não encontrado na base do ViaCEP');
      return;
    }

    document.getElementById('bairro').value = dados.bairro || '';
  } catch (erro) {
    console.error('Erro ao consultar CEP:', erro);
  } finally {
    setFieldLoading('cep', false);
    setFieldLoading('bairro', false);
  }
}

// ── CNES ─────────────────────────────────────
//
// O CNES complementa o CNPJ, não o substitui: a BrasilAPI (Receita) é
// a fonte mais confiável para razão social/endereço, e o CNES nem
// sempre traz CNPJ (ex: consultórios de pessoa física vêm com
// numero_cnpj = null). Por isso, aqui preenchemos apenas campos que
// estão VAZIOS ou que foram preenchidos por uma consulta CNES anterior
// (para o caso de o usuário corrigir o CNES digitado). Nunca
// sobrescrevemos o que o usuário digitou ou o que veio do CNPJ.

// id do campo -> último valor que o CNES colocou nele
const valoresPreenchidosPeloCnes = {};
// descarta respostas atrasadas se o usuário mudar o CNES no meio da consulta
let consultaCnesAtual = 0;

function preencherSeVazio(fieldId, valor) {
  const input = document.getElementById(fieldId);
  const novo = String(valor ?? '').trim();
  if (!novo) return;

  const atual = input.value.trim();
  const veioDoCnes = atual !== '' && atual === valoresPreenchidosPeloCnes[fieldId];

  if (atual === '' || veioDoCnes) {
    input.value = novo;
    valoresPreenchidosPeloCnes[fieldId] = novo;
  }
}

async function buscarDadosCnes(cnesLimpo) {
  const idConsulta = ++consultaCnesAtual;
  setFieldLoading('cnes', true);
  CAMPOS_AUTOPREENCHIDOS_POR_CNES.forEach((id) => setFieldLoading(id, true));
  try {
    const resp = await fetch(`${URL_API_CNES}/${cnesLimpo}`, {
      headers: { accept: 'application/json' },
    });

    if (!resp.ok) {
      // 404: CNES inexistente. Não bloqueia o cadastro.
      console.warn(`Consulta de CNES retornou status ${resp.status}`);
      return;
    }

    const corpo = await resp.json();
    if (idConsulta !== consultaCnesAtual) return; // resposta obsoleta

    // O endpoint por código devolve o objeto do estabelecimento; por
    // segurança, aceita também o formato de lista { estabelecimentos: [...] }.
    const est = Array.isArray(corpo?.estabelecimentos)
      ? corpo.estabelecimentos[0]
      : corpo;

    if (!est || !est.codigo_cnes) {
      console.warn('CNES não encontrado na base do Ministério da Saúde');
      return;
    }

    // 1) CNPJ -- só quando o campo está vazio e o CNES trouxe um válido.
    //    Dispara a BrasilAPI e ESPERA terminar, para que os dados da
    //    Receita entrem primeiro e o CNES só complete as lacunas.
    const cnpjCnes = String(est.numero_cnpj || est.numero_cnpj_entidade || '')
      .replace(/\D/g, '');
    const cnpjInput = document.getElementById('cnpj');
    if (cnpjCnes.length === 14 && cnpjInput.value.trim() === '') {
      cnpjInput.value = mascararCnpj(cnpjCnes);
      valoresPreenchidosPeloCnes.cnpj = cnpjInput.value;
      await buscarDadosCnpj(cnpjCnes);
      if (idConsulta !== consultaCnesAtual) return;
    }

    // 2) Demais campos, apenas os que continuarem vazios.
    preencherSeVazio('razao_social', est.nome_razao_social);
    preencherSeVazio('nome_fantasia', est.nome_fantasia);
    preencherSeVazio('cep', formatarCep(est.codigo_cep_estabelecimento));
    preencherSeVazio('bairro', est.bairro_estabelecimento);
    preencherSeVazio('numero', est.numero_estabelecimento);
  } catch (erro) {
    // Falha de rede/CORS/parse não deve bloquear o cadastro.
    console.error('Erro ao consultar CNES:', erro);
  } finally {
    // Sempre libera o que ESTA consulta ligou (mesmo se ficou obsoleta):
    // o contador por campo mantém o spinner ativo enquanto houver
    // outra consulta em andamento.
    setFieldLoading('cnes', false);
    CAMPOS_AUTOPREENCHIDOS_POR_CNES.forEach((id) => setFieldLoading(id, false));
  }
}

document.getElementById('cnpj').addEventListener('input', function () {
  const digits = this.value.replace(/\D/g, '');
  if (digits.length === 14) buscarDadosCnpj(digits);
});

document.getElementById('cep').addEventListener('input', function () {
  const digits = this.value.replace(/\D/g, '');
  if (digits.length === 8) buscarDadosCep(digits);
});

document.getElementById('cnes').addEventListener('input', function () {
  const digits = this.value.replace(/\D/g, '');
  if (digits.length === 7) buscarDadosCnes(digits);
});

// ── checagem de CNPJ já cadastrado ────────────
// Consulta o backend (sem persistir nada) para saber se o CNPJ já
// pertence a outra empresa. Retorna true/false/null:
//   true  -> CNPJ já existe
//   false -> CNPJ livre
//   null  -> não foi possível checar (erro de rede) -- não bloqueia
//            o avanço, já que a validação definitiva ocorre de
//            qualquer forma no POST /create do passo 2.
async function cnpjJaCadastrado(cnpjLimpo) {
  try {
    const resp = await fetch(`${URL_BASE_API}/empresas/existe-cnpj/${cnpjLimpo}`);
    if (!resp.ok) {
      console.warn(`Checagem de CNPJ retornou status ${resp.status}`);
      return null;
    }
    const corpo = await resp.json();
    // formato esperado: { data: { existe: true|false }, ... } (json_success)
    return Boolean(corpo?.data?.existe);
  } catch (erro) {
    console.error('Erro ao checar CNPJ existente:', erro);
    return null;
  }
}

// Mesma ideia do CNPJ, para o CNES. Se a rota existe-cnes ainda não
// existir no backend (404), retorna null e não bloqueia -- a checagem
// definitiva é o ConflictoError do POST /create.
async function cnesJaCadastrado(cnesLimpo) {
  try {
    const resp = await fetch(`${URL_BASE_API}/empresas/existe-cnes/${cnesLimpo}`);
    if (!resp.ok) {
      console.warn(`Checagem de CNES retornou status ${resp.status}`);
      return null;
    }
    const corpo = await resp.json();
    return Boolean(corpo?.data?.existe);
  } catch (erro) {
    console.error('Erro ao checar CNES existente:', erro);
    return null;
  }
}

// ── avanço para o passo 2 ─────────────────────
document.getElementById('form-empresa').addEventListener('submit', async function (e) {
  e.preventDefault();

  // Portão de validação: nada acontece se qualquer campo estiver fora
  // do formato/tamanho/caracteres esperado.
  if (!validarFormularioEmpresa()) {
    exibirMensagem('Corrija os campos destacados antes de continuar.', 'erro');
    return;
  }

  const cnpjLimpo = document.getElementById('cnpj').value.replace(/\D/g, '');
  const cnesLimpo = document.getElementById('cnes').value.replace(/\D/g, '');
  const botao = this.querySelector('.btn-primary');
  botao.disabled = true;

  try {
    // Checa só o(s) identificador(es) informado(s). true = já existe,
    // false = livre, null = checagem indisponível (não bloqueia; a
    // validação definitiva ocorre no POST /create).
    const [cnpjExiste, cnesExiste] = await Promise.all([
      cnpjLimpo ? cnpjJaCadastrado(cnpjLimpo) : Promise.resolve(false),
      cnesLimpo ? cnesJaCadastrado(cnesLimpo) : Promise.resolve(false),
    ]);

    if (cnpjExiste === true) {
      exibirMensagem('Este CNPJ já está cadastrado.', 'erro');
      return;
    }
    if (cnesExiste === true) {
      exibirMensagem('Este CNES já está cadastrado.', 'erro');
      return;
    }

    const dadosEmpresa = {
      cnpj: document.getElementById('cnpj').value || null,
      cnes: document.getElementById('cnes').value.trim() || null,
      nome_fantasia: document.getElementById('nome_fantasia').value.trim(),
      razao_social: document.getElementById('razao_social').value.trim() || null,
      cep: document.getElementById('cep').value,
      bairro: document.getElementById('bairro').value.trim(),
      numero: document.getElementById('numero').value.trim(),
      complemento: document.getElementById('complemento').value.trim() || null,
      plano: document.querySelector('input[name="plano"]:checked').value,
    };

    // Guarda os dados da empresa para o passo 2 recuperar e enviar
    // tudo junto (empresa + admin) em POST /empresa/create. Inclui um
    // timestamp para o passo 2 poder descartar dados velhos (TTL).
    sessionStorage.setItem(CHAVE_SESSION_EMPRESA, JSON.stringify({
      dados: dadosEmpresa,
      salvoEm: Date.now(),
    }));

    window.location.href = '../../../html/pages/user/admin/adminRegistration.html';
  } finally {
    botao.disabled = false;
  }
});