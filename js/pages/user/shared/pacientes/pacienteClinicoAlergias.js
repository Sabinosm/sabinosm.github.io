// pacienteClinicoAlergias.js
//
// Bloco clínico da ficha — MODO LEITURA. Lista as alergias do
// paciente com suas reações. Edição (criar/alterar/remover alergia ou
// reação) só acontece DURANTE UM ATENDIMENTO — nada disso aqui.
//
// TODO: confirmar os nomes dos campos de Alergia.to_dict() /
// ReacaoAlergia.to_dict() (assumi alergia: { substancia,
// codigo_substancia, flag_confirmado, reacoes: [{ manifestacao,
// gravidade, descricao, data_ocorrencia }] }).

import { GRAVIDADES_ALERGIA, TIPOS_MANIFESTACAO_ALERGIA, listarAlergias } from "./pacienteClinicoApi.js";

const GRAVIDADE_LABELS = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' };
const MANIFESTACAO_LABELS = {
  cutanea: 'Cutânea', respiratoria: 'Respiratória', anafilaxia: 'Anafilaxia',
  gastrointestinal: 'Gastrointestinal', cardiovascular: 'Cardiovascular', sistemica: 'Sistêmica',
};

export function inicializarAlergias(uuidPaciente) {
  const container = document.getElementById('clinico-alergias-lista');
  if (!container) return;

  container.innerHTML = '<p class="empty-state-text">Carregando…</p>';

  listarAlergias(uuidPaciente)
    .then(resposta => renderizar(container, resposta.data ?? []))
    .catch(() => {
      container.innerHTML = '';
      container.appendChild(aviso('Não foi possível carregar as alergias.'));
    });
}

function renderizar(container, itens) {
  container.innerHTML = '';

  if (itens.length === 0) {
    container.appendChild(aviso('Nenhuma alergia registrada.'));
    return;
  }

  itens.forEach(a => container.appendChild(criarCardAlergia(a)));
}

function aviso(texto) {
  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.style.padding = '8px 0';
  p.textContent = texto;
  return p;
}

function criarCardAlergia(a) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const main = document.createElement('div');
  main.className = 'consult-main';

  const titulo = document.createElement('h3');
  titulo.className = 'consult-patient';
  titulo.textContent = a.substancia ?? 'Alergia';
  if (a.codigo_substancia) titulo.textContent += ` (${a.codigo_substancia})`;
  if (a.flag_confirmado) titulo.textContent += ' ✓ confirmada';

  main.appendChild(titulo);

  (a.reacoes ?? []).forEach(r => {
    const linha = document.createElement('p');
    linha.className = 'consult-meta';
    const partes = [
      MANIFESTACAO_LABELS[r.manifestacao] ?? r.manifestacao,
      GRAVIDADE_LABELS[r.gravidade] ?? r.gravidade,
      r.data_ocorrencia ? formatarData(r.data_ocorrencia) : null,
    ].filter(Boolean);
    linha.textContent = `Reação: ${partes.join(' · ')}${r.descricao ? ` — ${r.descricao}` : ''}`;
    main.appendChild(linha);
  });

  card.appendChild(main);
  return card;
}

function formatarData(isoOuData) {
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}