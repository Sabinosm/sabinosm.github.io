// pacienteDetalheHistorico.js
//
// Histórico de consultas do paciente na ficha (todos os papéis veem —
// a rota aceita admin por regra de produto: admin vê o resumo do
// ciclo da consulta, só não vê conteúdo clínico).
//
// Item da resposta (Consulta.to_dict(), limitado às 5 mais recentes):
//   { uuid, origem_encaminhamento, status_consulta, data_hora_inicio,
//     data_hora_fim, desfecho_final, paciente_uuid }
//
// "Ver detalhes" navega para a tela de detalhe da consulta — essa
// parte já existe no projeto (ver comentário do usuário); TODO: ajustar
// o nome do arquivo/parâmetro da querystring para a rota real.

import { ApiError, listarHistoricoConsultas } from "./pacientesApi.js";

const STATUS_LABELS = {
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}

export function inicializarHistorico(uuidPaciente) {
  const container = document.getElementById('lista-historico-consultas');
  if (!container) return;

  container.innerHTML = '<p class="empty-state-text" style="padding: 12px 0;">Carregando histórico…</p>';

  listarHistoricoConsultas(uuidPaciente)
    .then(resposta => renderizar(container, resposta.data ?? []))
    .catch(erro => {
      const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o histórico.';
      container.innerHTML = '';
      container.appendChild(criarAviso(mensagem));
    });
}

function renderizar(container, itens) {
  container.innerHTML = '';

  if (itens.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'empty-state-text';
    vazio.style.padding = '12px 0';
    vazio.textContent = 'Nenhuma consulta registrada para este paciente.';
    container.appendChild(vazio);
    return;
  }

  itens.forEach(c => container.appendChild(criarCardConsulta(c)));
}

function criarAviso(texto) {
  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.style.padding = '12px 0';
  p.textContent = texto;
  return p;
}

function criarCardConsulta(c) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const status = document.createElement('div');
  status.className = 'consult-status status--em-atendimento'; // TODO: mapear classes por status_consulta real
  status.innerHTML = '<span class="status-dot"></span> ';
  status.append(document.createTextNode(STATUS_LABELS[c.status_consulta] ?? c.status_consulta ?? '—'));

  const main = document.createElement('div');
  main.className = 'consult-main';

  const titulo = document.createElement('h3');
  titulo.className = 'consult-patient';
  titulo.textContent = c.origem_encaminhamento
    ? `Origem: ${c.origem_encaminhamento}`
    : 'Consulta';

  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  const inicio = formatarDataHora(c.data_hora_inicio);
  const fim = c.data_hora_fim ? formatarDataHora(c.data_hora_fim) : 'em andamento';
  const desfecho = c.desfecho_final ? ` · Desfecho: ${c.desfecho_final}` : '';
  meta.textContent = `${inicio} → ${fim}${desfecho}`;

  main.append(titulo, meta);

  const btn = document.createElement('a');
  btn.className = 'btn-ghost';
  btn.textContent = 'Ver detalhes';
  // TODO: ajustar para a rota real de detalhe da consulta.
  btn.href = `consultaDetalhe.html?uuid=${encodeURIComponent(c.uuid)}`;

  card.append(status, main, btn);
  return card;
}