// adminRegistration.js
//
// Passo 2 de 2 do fluxo "Junte-se a nós": criação do administrador.
// O backend só persiste empresa+admin juntos (POST /empresa/create),
// então este passo não referencia uma empresa já criada -- ele lê os
// dados da empresa (preenchidos no passo 1) do sessionStorage e, ao
// concluir, envia tudo junto: { empresa: {...}, admin: {...} }.
//
// Validação de campos (formato, tamanho, caracteres) foi extraída para
// adminValidation.js -- este arquivo cuida de máscaras, sessionStorage
// e envio.
//
// Animação de fundo: /js/pages/user/admin/animations/particles.js
// Mensagens de feedback: /js/shared/feedback.js

import { exibirMensagem } from "../../shared/feedback.js";
import {
  validarFormularioAdmin,
  ligarValidacaoEmTempoReal,
  getTipoPapelSelecionado,
  aplicarErrosBackend,
  aplicarErrosPorCampo,
  clearError,
} from "./adminValidation.js";
import { ativarTogglesSenha } from "../../sharedConfig/passwordManagement/passwordToggle.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

const CHAVE_SESSION_EMPRESA = 'bion_cadastro_empresa';
// Mesmo TTL usado em enterpriseRegistration.js -- dados mais velhos
// que isso são tratados como obsoletos (ex: aba esquecida aberta).
const TTL_SESSION_EMPRESA_MS = 30 * 60 * 1000; // 30 minutos

// ── dados da empresa (passo 1 -> passo 2) ───────────────────────
//
// Lidos do sessionStorage, gravados pelo enterpriseRegistration.js
// ao final do passo 1, junto com o timestamp de quando foram salvos.
// Sem eles (ou se estiverem expirados), este passo não faz sentido
// sozinho -- volta para o início do fluxo em vez de deixar submeter
// um admin órfão (o backend também rejeitaria por faltar `empresa`
// no corpo, mas o front não deveria nem oferecer a tela).
let dadosEmpresa = null;
let salvoEmEmpresa = null; // timestamp original, preservado se voltarmos ao passo 1
try {
  const bruto = sessionStorage.getItem(CHAVE_SESSION_EMPRESA);
  const registro = bruto ? JSON.parse(bruto) : null;

  if (registro && registro.dados && registro.salvoEm) {
    const expirado = Date.now() - registro.salvoEm > TTL_SESSION_EMPRESA_MS;
    if (expirado) {
      sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
    } else {
      dadosEmpresa = registro.dados;
      salvoEmEmpresa = registro.salvoEm;
    }
  }
} catch (erro) {
  console.error('Erro ao ler dados da empresa do sessionStorage:', erro);
  dadosEmpresa = null;
}

if (!dadosEmpresa) {
  window.location.href = '../../../../html/pages/enterprise/enterpriseRegistration.html';
}

// Se o usuário sair desta página sem concluir o cadastro (fechar aba,
// voltar, navegar para outro lugar), os dados da empresa não têm mais
// utilidade parados no sessionStorage -- limpamos para reduzir o
// tempo que ficam expostos. Cadastro concluído com sucesso também já
// limpa explicitamente (ver bloco de envio).
let cadastroConcluido = false;
// Quando o servidor recusa algo da EMPRESA, voltamos ao passo 1 para
// corrigir -- nesse caso os dados precisam sobreviver à navegação
// (o passo 1 os restaura e já apaga do sessionStorage ao carregar).
let voltandoParaCorrecao = false;
window.addEventListener('pagehide', function () {
  if (!cadastroConcluido && !voltandoParaCorrecao) {
    sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
  }
});

// ── erros do servidor que pertencem à EMPRESA ───────────────────
//
// O POST /create valida empresa e admin juntos. Erros de campo do admin
// são pintados aqui (aplicarErrosBackend), mas erros da empresa não têm
// input nesta página -- então são identificados aqui e o usuário é
// devolvido ao passo 1, onde os campos são restaurados e pintados.
//
// Caminho principal: o backend manda `erros: { campo: mensagem }` no
// corpo do json_error (ver BionException.erros), então não há
// dependência do texto das mensagens.
// Plano B (respostas sem `erros`, ex: backend ainda não atualizado):
// parse do formato "campo: msg; campo2: msg2" na string `message`.
const CAMPOS_EMPRESA = [
  'cnpj', 'cnes', 'nome_fantasia', 'razao_social', 'cep', 'bairro',
  'numero', 'complemento',
];

function separarErrosEmpresa(mensagem) {
  const erros = {};
  const restantes = [];

  (mensagem || '').split(';').forEach((parte) => {
    const trecho = parte.trim();
    if (!trecho) return;

    const idx = trecho.indexOf(':');
    if (idx !== -1) {
      const campo = trecho.slice(0, idx).trim();
      if (CAMPOS_EMPRESA.includes(campo)) {
        erros[campo] = trecho.slice(idx + 1).trim();
        return;
      }
    }

    restantes.push(trecho);
  });

  return { erros, restante: restantes.join('; ') };
}

// ── animação de fundo (partículas) ──────────
// Movida para /js/pages/user/admin/animations/particles.js (mesmo
// arquivo do login/onboarding) -- ver import do <script> no HTML.

// ── máscaras simples de cpf e telefone ──────
document.getElementById('cpf').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  e.target.value = v;
});

document.getElementById('telefone').addEventListener('input', function (e) {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/^(\d{2})(\d)/, '($1) $2');
  v = v.replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  e.target.value = v;
});

// ── validação em tempo real (formato, tamanho, caracteres) ───
ligarValidacaoEmTempoReal();

// ── mostrar/ocultar senha (olhinho) ───────────────────────────
ativarTogglesSenha('#senha, #confirmar_senha');

// ── função clínica: toggle dos campos de CRM/COREN ────────────
// Espelha a regra cruzada de schema_usuario.py: só o bloco do
// tipo_papel selecionado deve ter valor/ser enviado -- o backend
// rejeita payload com campo de médico presente e tipo_papel=null (ou
// vice-versa). Por isso, ao trocar de opção, o bloco que sai de cena
// tem seus inputs limpos e os erros visuais removidos.
const CAMPOS_POR_BLOCO = {
  'campos-medico': ['numero_crm', 'uf_crm', 'rqe'],
  'campos-enfermeiro': ['numero_coren', 'uf_coren', 'especialidade'],
};

function limparBloco(blocoId) {
  CAMPOS_POR_BLOCO[blocoId].forEach((id) => {
    document.getElementById(id).value = '';
    clearError(id);
  });
}

function atualizarCamposFuncaoClinica() {
  const tipo = getTipoPapelSelecionado(); // 'medico' | 'enfermeiro' | null

  const blocoMedico = document.getElementById('campos-medico');
  const blocoEnfermeiro = document.getElementById('campos-enfermeiro');

  blocoMedico.hidden = tipo !== 'medico';
  blocoEnfermeiro.hidden = tipo !== 'enfermeiro';

  if (tipo !== 'medico') limparBloco('campos-medico');
  if (tipo !== 'enfermeiro') limparBloco('campos-enfermeiro');
}

document.querySelectorAll('input[name="tipo_papel"]').forEach((radio) => {
  radio.addEventListener('change', atualizarCamposFuncaoClinica);
});
// Estado inicial (garante consistência caso o navegador restaure um
// radio diferente do 'checked' do HTML ao recarregar a página).
atualizarCamposFuncaoClinica();

// ── envio ────────────────────────────────────
document.getElementById('form-admin').addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!validarFormularioAdmin()) return;

  // Segunda checagem: dadosEmpresa só é lido uma vez no carregamento
  // da página, então se o sessionStorage for limpo/expirar durante o
  // preenchimento, ainda pegamos isso aqui antes de tentar enviar.
  if (!dadosEmpresa) {
    exibirMensagem('Dados da empresa não encontrados. Reinicie o cadastro.', 'erro');
    window.location.href = '../../../../html/pages/enterprise/enterpriseRegistration.html';
    return;
  }

  // ALTERADO (assertivo, sem alias): tipo_usuario saiu do model
  // Usuario -- is_admin (bool) entra no lugar. Este é o admin
  // fundador (super admin), criado junto com a empresa via
  // Empresa.cadastrar_com_admin, que seta is_super_admin=True à
  // parte; aqui só precisamos marcar is_admin=True.
  //
  // tipo_papel: o fundador também pode ter função clínica (é
  // ortogonal a is_admin -- ver schema_usuario.py). 'senha' continua
  // sendo enviada mesmo com tipo_papel setado: a proibição de senha
  // para médico/enfermeiro no schema tem exceção para is_admin=True.
  const tipoPapel = getTipoPapelSelecionado();

  const dadosAdmin = {
    nome_completo: document.getElementById('nome_completo').value.trim(),
    cpf: document.getElementById('cpf').value,
    email: document.getElementById('email').value.trim(),
    telefone: document.getElementById('telefone').value || null,
    user_login: document.getElementById('user_login').value.trim(),
    is_admin: true,
    tipo_papel: tipoPapel,
    senha: document.getElementById('senha').value,
  };

  if (tipoPapel === 'medico') {
    dadosAdmin.numero_crm = document.getElementById('numero_crm').value.trim();
    dadosAdmin.uf_crm = document.getElementById('uf_crm').value.trim().toUpperCase();
    dadosAdmin.rqe = document.getElementById('rqe').value.trim() || null;
  } else if (tipoPapel === 'enfermeiro') {
    dadosAdmin.numero_coren = document.getElementById('numero_coren').value.trim();
    dadosAdmin.uf_coren = document.getElementById('uf_coren').value.trim().toUpperCase();
    dadosAdmin.especialidade = document.getElementById('especialidade').value.trim();
  }

  const botao = this.querySelector('.btn-primary');
  botao.disabled = true;
  let redirecionando = false; // mantém o botão travado durante o redirecionamento

  try {
    const resp = await fetch(`${URL_BASE_API}/empresas/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa: dadosEmpresa, admin: dadosAdmin }),
    });

    const corpo = await resp.json().catch(() => null);

    if (!resp.ok) {
      // json_error retorna { message, ... } com o motivo (ex: CNPJ
      // duplicado, e-mail já usado etc.)
      const mensagem = corpo?.message || 'Não foi possível concluir o cadastro.';
      // Marca em vermelho os campos que o backend apontou (formato
      // "campo: msg; campo2: msg2" -- ver _formatar_erros_pydantic no
      // service). O que sobra (erros de model_validator, sem campo
      // mapeável) vai para a mensagem geral.
      let errosEmpresa = {};
      let restante = '';

      if (corpo?.erros && typeof corpo.erros === 'object') {
        // Estruturado: { campo: mensagem }. Pinta o que é do admin e
        // separa o que é da empresa; o resto vai para a mensagem geral.
        const sobra = aplicarErrosPorCampo(corpo.erros);
        const outros = [];
        Object.entries(sobra).forEach(([campo, msg]) => {
          if (CAMPOS_EMPRESA.includes(campo)) errosEmpresa[campo] = msg;
          else outros.push(campo === '_geral' ? msg : `${campo}: ${msg}`);
        });
        restante = outros.join('; ');
      } else {
        // Plano B: parse do texto da mensagem.
        const restanteAdmin = aplicarErrosBackend(mensagem);
        ({ erros: errosEmpresa, restante } = separarErrosEmpresa(restanteAdmin));
      }
      const temErroEmpresa = Object.keys(errosEmpresa).length > 0;
      const temErroAdminNoForm = !!document.querySelector('#form-admin .field.has-error');

      // Só erro de empresa (nada do admin pendente nesta tela): volta ao
      // passo 1 levando os dados e os erros para lá. Se também houver
      // erro do admin, fica aqui -- o usuário corrige o admin e, se a
      // empresa ainda for recusada, aí sim é redirecionado.
      if (temErroEmpresa && !restante && !temErroAdminNoForm) {
        voltandoParaCorrecao = true;
        redirecionando = true;
        sessionStorage.setItem(CHAVE_SESSION_EMPRESA, JSON.stringify({
          dados: dadosEmpresa,
          salvoEm: salvoEmEmpresa || Date.now(),
          erros: errosEmpresa,
        }));
        exibirMensagem('Há dados da empresa para corrigir. Voltando ao passo 1...', 'erro');
        setTimeout(() => {
          window.location.href = '../../../../html/pages/enterprise/enterpriseRegistration.html';
        }, 1500);
        return;
      }

      const mensagens = [restante, ...Object.values(errosEmpresa)].filter(Boolean);
      exibirMensagem(mensagens.join('; ') || 'Corrija os campos destacados.', 'erro');
      return;
    }

    // Sucesso: dados da empresa não são mais necessários.
    cadastroConcluido = true;
    sessionStorage.removeItem(CHAVE_SESSION_EMPRESA);
    exibirMensagem('Cadastro concluído! Redirecionando para o login...', 'sucesso');
    setTimeout(() => {
      window.location.href = '../../../../html/pages/auth/login.html';
    }, 1500);
  } catch (erro) {
    console.error('Erro ao enviar cadastro:', erro);
    exibirMensagem('Erro de conexão. Tente novamente.', 'erro');
  } finally {
    if (!redirecionando) botao.disabled = false;
  }
});