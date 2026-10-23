// pacienteClinicoTipoSanguineo.js
//
// Bloco clínico da ficha — MODO LEITURA (decisão: dados clínicos só
// são alterados durante atendimento; esta tela não edita nada).
//
// Mostra o tipo sanguíneo VIGENTE (GET /pacientes/<uuid>/tipo-sanguineo).
// O histórico de observações fica disponível via
// listarHistoricoTipoSanguineo() em pacienteClinicoApi.js quando
// quisermos exibi-lo (TODO de produto).
//
// TODO: confirmar os nomes dos campos de ObservacaoTipoSanguineo.to_dict()
// (assumi { tipo_sanguineo, data, ... }).

import { buscarTipoSanguineoVigente } from "./pacienteClinicoApi.js";

export function inicializarTipoSanguineo(uuidPaciente) {
  const dd = document.getElementById('clinico-view-tipo-sanguineo');
  if (!dd) return;

  dd.textContent = 'Carregando…';

  buscarTipoSanguineoVigente(uuidPaciente)
    .then(resposta => {
      const obs = resposta.data;
      // data === null quando nunca foi registrado
      dd.textContent = obs?.tipo_sanguineo
        ? `${obs.tipo_sanguineo}${obs.data ? ` (desde ${formatarData(obs.data)})` : ''}`
        : 'Não informado';
    })
    .catch(() => {
      dd.textContent = '—';
    });
}

function formatarData(isoOuData) {
  if (!isoOuData) return '';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}