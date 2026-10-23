// pacienteClinicoMedicamentos.js
//
// Bloco clínico da ficha — MODO LEITURA. Lista os medicamentos em uso
// (todos; passar { apenasAtivos: true } se quiser só os ativos).
// Registrar/substituir/encerrar/remover só DURANTE UM ATENDIMENTO.
//
// TODO: confirmar os nomes dos campos de MedicamentoEmUso.to_dict()
// (assumi { descricao, dose, frequencia, desde, ate, status_uso,
// deletado }).

import { listarMedicamentosEmUso } from "./pacienteClinicoApi.js";

const STATUS_USO_LABELS = {
  ativo: 'Em uso',
  interrompido: 'Interrompido',
  concluido: 'Concluído',
};

export function inicializarMedicamentos(uuidPaciente) {
  const container = document.getElementById('clinico-medicamentos-lista');
  if (!container) return;

  container.innerHTML = '<p class="empty-state-text">Carregando…</p>';

  listarMedicamentosEmUso(uuidPaciente)
    .then(resposta => renderizar(container, resposta.data ?? []))
    .catch(() => {
      container.innerHTML = '';
      container.appendChild(aviso('Não foi possível carregar os medicamentos.'));
    });
}

function renderizar(container, itens) {
  container.innerHTML = '';

  const visiveis = itens.filter(m => !m.deletado);
  if (visiveis.length === 0) {
    container.appendChild(aviso('Nenhum medicamento em uso registrado.'));
    return;
  }

  visiveis.forEach(m => container.appendChild(criarCardMedicamento(m)));
}

function aviso(texto) {
  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.style.padding = '8px 0';
  p.textContent = texto;
  return p;
}

function criarCardMedicamento(m) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const status = document.createElement('div');
  status.className = 'consult-status status--em-atendimento';
  status.innerHTML = '<span class="status-dot"></span> ';
  status.append(document.createTextNode(STATUS_USO_LABELS[m.status_uso] ?? m.status_uso ?? '—'));

  const main = document.createElement('div');
  main.className = 'consult-main';

  const titulo = document.createElement('h3');
  titulo.className = 'consult-patient';
  titulo.textContent = m.descricao ?? 'Medicamento';

  const detalhes = [
    m.dose ? `Dose: ${m.dose}` : null,
    m.frequencia ? `Frequência: ${m.frequencia}` : null,
    m.desde ? `Desde ${formatarData(m.desde)}` : null,
    m.ate ? `Até ${formatarData(m.ate)}` : null,
  ].filter(Boolean);

  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  meta.textContent = detalhes.join(' · ') || '—';

  main.append(titulo, meta);
  card.append(status, main);
  return card;
}

function formatarData(isoOuData) {
  if (!isoOuData) return '';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}