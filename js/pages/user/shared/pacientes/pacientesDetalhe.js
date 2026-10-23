// pacientesDetalhe.js
//
// Orquestrador da ficha do paciente (pacientesDetalhe.html).
// Carrega: dados pessoais (editáveis), histórico de consultas e —
// para médico/enfermeiro — os dados clínicos em MODO LEITURA.
//
// DECISÃO DE PRODUTO: a ficha NÃO edita dados clínicos (alergias,
// doenças crônicas, medicamentos, tipo sanguíneo, peso/altura).
// Esses blocos só são alterados DURANTE UM ATENDIMENTO (todas as
// rotas de escrita exigem uuid_atendimento no back). Esta tela exibe
// tudo em leitura para médico/enfermeiro; admin não vê a seção
// clínica (e o back vai passar a devolver 403 nessas leituras quando
// endurecido — até lá o front já esconde).
//
// Permissões (userCachePermissoes.js):
//   - todos (admin/médico/enfermeiro): dados pessoais + histórico;
//   - só atenderClinicamente (médico/enfermeiro): seção clínica.

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
// TODO: ajustar o caminho conforme onde fica userCachePermissoes.js
import { getPermissoes } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { ApiError, buscarDetalhePessoal } from "../pacientesApi.js";
import { inicializarPessoal } from "./pacienteDetalhePessoal.js";
import { inicializarHistorico } from "./pacienteDetalheHistorico.js";
import { inicializarTipoSanguineo } from "./clinico/pacienteClinicoTipoSanguineo.js";
import { inicializarAlergias } from "./clinico/pacienteClinicoAlergias.js";
import { inicializarDoencas } from "./clinico/pacienteClinicoDoencas.js";
import { inicializarMedicamentos } from "./clinico/pacienteClinicoMedicamentos.js";

document.addEventListener('DOMContentLoaded', () => {
  iniciarPagina();
  carregarFicha();
});

function obterUuidDaUrl() {
  const params = new URLSearchParams(window.location.search);
  const uuid = params.get('uuid');
  return uuid && uuid.trim() ? uuid.trim() : null;
}

async function carregarFicha() {
  const uuid = obterUuidDaUrl();
  if (!uuid) {
    mostrarErro('Link inválido: o identificador do paciente não foi informado.');
    return;
  }

  let paciente;
  try {
    const resposta = await buscarDetalhePessoal(uuid);
    paciente = resposta.data ?? {};
  } catch (erro) {
    mostrarErro(erro instanceof ApiError ? erro.message : 'Não foi possível carregar a ficha do paciente.');
    return;
  }

  mostrarFicha();

  // Dados pessoais (editáveis) + gerenciamento + header.
  inicializarPessoal(paciente, uuid);

  // Histórico de consultas — todos os papéis (rota aceita admin).
  inicializarHistorico(uuid);

  // Seção clínica em LEITURA — apenas médico/enfermeiro.
  if (getPermissoes().atenderClinicamente) {
    document.getElementById('painel-clinico').hidden = false;
    inicializarTipoSanguineo(uuid);
    inicializarAlergias(uuid);
    inicializarDoencas(uuid);
    inicializarMedicamentos(uuid);
  }
}

function mostrarFicha() {
  document.getElementById('estado-carregando').hidden = true;
  document.getElementById('estado-erro').hidden = true;
  document.getElementById('ficha-paciente').hidden = false;
}

function mostrarErro(mensagem) {
  document.getElementById('estado-carregando').hidden = true;
  document.getElementById('ficha-paciente').hidden = true;
  document.getElementById('estado-erro-texto').textContent = mensagem;
  document.getElementById('estado-erro').hidden = false;
}