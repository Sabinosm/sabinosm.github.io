// enterpriseRegistration.js
//
// Passo 1 de 2 do fluxo "Junte-se a nós": cadastro da empresa.
// O backend só persiste empresa+admin juntos (POST /empresa/create),
// então este passo NÃO cria a empresa sozinho -- ele apenas:
//   1. valida os campos localmente (validation.js)
//   2. confere no backend se o CNPJ já existe (GET /empresa/existe-cnpj/<cnpj>)
//   3. se estiver livre, guarda os dados da empresa em sessionStorage
//      e navega para adminRegistration.html
//   4. o passo 2 lê os dados da empresa do sessionStorage e, ao
//      concluir, envia tudo junto (empresa + admin) para POST /create
//
// Validação de campos (formato, tamanho, caracteres) foi extraída para
// validation.js -- este arquivo cuida de máscaras, autocomplete e do
// avanço para o próximo passo.

const CHAVE_SESSION_EMPRESA = 'bion_cadastro_empresa';
// Tempo de vida dos dados guardados no sessionStorage. Passado isso,
// consideramos "velhos" (ex: aba esquecida aberta) e mandamos o
// usuário reiniciar o passo 1 em vez de seguir com dados obsoletos.
const TTL_SESSION_EMPRESA_MS = 30 * 60 * 1000; // 30 minutos

import { exibirMensagem } from "../../shared/feedback.js";
import { validarFormularioEmpresa, ligarValidacaoEmTempoReal } from "./enterpriseValidation.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

// ── máscaras ─────────────────────────────────
document.getElementById('cnpj').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/(\d{2})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1/$2');
  v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  e.target.value = v;
});

document.getElementById('cep').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  e.target.value = v;
});

// ── validação em tempo real (formato, tamanho, caracteres) ───
ligarValidacaoEmTempoReal();

// ── autopreenchimento (estruturado, não ligado ainda) ────────────
//
// Os dois hooks abaixo já disparam no momento certo (CNPJ completo /
// CEP completo) e já têm o esqueleto de loading state + preenchimento
// de campo, mas a chamada de API real fica pendente -- falta decidir
// qual serviço usar (BrasilAPI, ReceitaWS para CNPJ; ViaCEP para CEP)
// e ajustar tratamento de erro (CNPJ/CEP não encontrado, rate limit).

function setFieldLoading(fieldId, isLoading) {
  const field = document.getElementById(fieldId).closest('.field');
  field.classList.toggle('is-loading', isLoading);
}

// Formata o CEP puro-dígitos vindo da BrasilAPI ("01311902") para o
// mesmo formato que a máscara do campo produz ("01311-902"), já que
// o input de CEP espera esse padrão (ver máscara no topo do arquivo).
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
    //
    // Preenche todo campo do formulário que tem correspondente direto
    // no retorno da BrasilAPI (mesmo conjunto de campos que já existe
    // hoje -- nenhum campo novo foi criado na UI).
    document.getElementById('razao_social').value = dados.razao_social || '';
    document.getElementById('nome_fantasia').value = dados.nome_fantasia || '';
    document.getElementById('bairro').value = dados.bairro || '';
    document.getElementById('numero').value = dados.numero || '';
    document.getElementById('complemento').value = dados.complemento || '';

    // CEP: formata para o padrão da máscara do campo. Setar o campo
    // via .value não dispara 'input', então o listener que aciona o
    // ViaCEP não entra em conflito aqui -- o bairro já veio da própria
    // BrasilAPI acima. Se o usuário editar o CEP manualmente depois,
    // o fluxo normal do ViaCEP assume dali em diante.
    const cepFormatado = formatarCep(dados.cep);
    if (cepFormatado) {
      document.getElementById('cep').value = cepFormatado;
    }
  } catch (erro) {
    console.error('Erro ao consultar CNPJ:', erro);
    // Falha de rede/parse não deve bloquear o cadastro -- os campos
    // continuam editáveis manualmente.
  } finally {
    setFieldLoading('cnpj', false);
    CAMPOS_AUTOPREENCHIDOS_POR_CNPJ.forEach((id) => setFieldLoading(id, false));
  }
}

async function buscarDadosCep(cepLimpo) {
  setFieldLoading('cep', true);
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

    const bairroInput = document.getElementById('bairro');
    // Sempre atualiza quando o CEP é completado, pelo mesmo motivo do
    // CNPJ/razão social acima -- reflete o CEP atual, não o anterior.
    bairroInput.value = dados.bairro || '';
  } catch (erro) {
    console.error('Erro ao consultar CEP:', erro);
  } finally {
    setFieldLoading('cep', false);
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
  const botao = this.querySelector('.btn-primary');
  botao.disabled = true;

  try {
    const jaExiste = await cnpjJaCadastrado(cnpjLimpo);

    if (jaExiste === true) {
      exibirMensagem('Este CNPJ já está cadastrado.', 'erro');
      return;
    }
    // jaExiste === false (livre) ou null (checagem indisponível) ->
    // segue o fluxo; a validação definitiva ocorre no POST /create.

    const dadosEmpresa = {
      cnpj: document.getElementById('cnpj').value,
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