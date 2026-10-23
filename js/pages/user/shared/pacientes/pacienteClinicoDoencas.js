// pacienteClinicoDoencas.js
//
// Bloco clínico da ficha — MODO LEITURA. Lista as doenças crônicas
// (linhas vigentes). Edição/revisão (POST /revisar, que fecha a linha
// vigente e cria outra) só acontece DURANTE UM ATENDIMENTO.
//
// TODO: confirmar os nomes dos campos de DoencaCronica.to_dict()
// (assumi { codigo_cid10, descricao_cid10, desde, status, observacoes }).

import { STATUS_DOENCA_CRONICA, listarDoencasCronicas } from "./pacienteClinicoApi.js";

const STATUS_LABELS = { ativa: 'Ativa', 'em-remissao': 'Em remissão' };

export function inicializarDoencas(uuidPaciente) {
  const container = document.getElementById('clinico-doencas-lista');
  if (!container) return;

  container.innerHTML = '<p class="empty-state-text">Carregando…</p>';

  listarDoencasCronicas(uuidPaciente)
    .then(resposta => renderizar(container, resposta.data ?? []))
    .catch(() => {
      container.innerHTML = '';
      container.appendChild(aviso('Não foi possível carregar as doenças crônicas.'));
    });
}

function renderizar(container, itens) {
  container.innerHTML = '';

  if (itens.length === 0) {
    container.appendChild(aviso('Nenhuma doença crônica registrada.'));
    return;
  }

  itens.forEach(d => container.appendChild(criarCardDoenca(d)));
}

function aviso(texto) {
  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.style.padding = '8px 0';
  p.textContent = texto;
  return p;
}

function criarCardDoenca(d) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const status = document.createElement('div');
  status.className = 'consult-status status--em-atendimento';
  status.innerHTML = '<span class="status-dot"></span> ';
  status.append(document.createTextNode(STATUS_LABELS[d.status] ?? d.status ?? '—'));

  const main = document.createElement('div');
  main.className = 'consult-main';

  const titulo = document.createElement('h3');
  titulo.className = 'consult-patient';
  titulo.textContent = d.codigo_cid10
    ? `${d.codigo_cid10} — ${d.descricao_cid10 ?? ''}`.trim()
    : (d.descricao_cid10 ?? 'Doença crônica');

  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  meta.textContent = `Desde ${formatarData(d.desde)}`;

  main.append(titulo, meta);

  if (d.observacoes) {
    const obs = document.createElement('p');
    obs.className = 'consult-meta';
    obs.textContent = d.observacoes;
    main.appendChild(obs);
  }

  card.append(status, main);
  return card;
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}