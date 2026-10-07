// catalogosRegras.js
//
// Regras de habilitação dos controles, funções PURAS sobre o resumo do
// card (sem DOM, sem fetch). Espelham as recusas do back para o botão
// nascer desabilitado com o motivo no tooltip -- mas o back continua
// sendo a autoridade: qualquer 409/400 que escape daqui vira toast.
//
// Campos do resumo usados (ProtocoloCatalogoService._montar_resumo):
//   liberado_pela_empresa, politica, escopo_uso,
//   favorito (null = sem papel clínico; true/false = favorito do profissional),
//   default_pessoal (escopo | null), padrao_institucional (escopo | null)

import { rotuloEscopoUso } from "./catalogosLabels.js";

const ESCOPOS = ['triagem', 'consulta', 'ambos'];

/** true se o usuário tem preferência pessoal (médico/enfermeiro) -- vem do back. */
export function ehProfissional(p) {
  return p.favorito !== null && p.favorito !== undefined;
}

/**
 * Escopos em que o protocolo pode ser padrão: o back exige
 * escopo_uso ∈ {escopo, 'ambos'} -- então um de uso 'ambos' serve a
 * qualquer escopo e os demais só ao próprio.
 */
export function escoposCompativeis(p) {
  if (p.escopo_uso === 'ambos') return [...ESCOPOS];
  return ESCOPOS.includes(p.escopo_uso) ? [p.escopo_uso] : [];
}

/** Estrela do card / botão "favorito" do drawer. */
export function regrasEstrela(p) {
  if (!ehProfissional(p)) return { visivel: false };

  if (p.favorito) {
    // Cheia: remover é permitido mesmo se a instituição desativou depois
    // (limpeza), salvo as duas travas do back.
    if (p.politica === 'obrigatorio') {
      return { visivel: true, cheia: true, habilitada: false,
        titulo: 'Obrigatório na instituição: não pode ser removido dos favoritos' };
    }
    if (p.padrao_institucional) {
      return { visivel: true, cheia: true, habilitada: false,
        titulo: `Padrão da instituição (${rotuloEscopoUso(p.padrao_institucional)}): não pode ser removido dos favoritos` };
    }
    return { visivel: true, cheia: true, habilitada: true, titulo: 'Remover dos meus favoritos' };
  }

  if (!p.liberado_pela_empresa) {
    return { visivel: true, cheia: false, habilitada: false,
      titulo: 'Protocolo não liberado pela instituição' };
  }
  return { visivel: true, cheia: false, habilitada: true, titulo: 'Adicionar aos meus favoritos' };
}

/** Padrão pessoal (drawer, bloco "Minha configuração"). */
export function regrasPadraoPessoal(p) {
  if (!ehProfissional(p)) return { visivel: false };

  const escopos = escoposCompativeis(p);
  let motivo = null;
  if (!p.liberado_pela_empresa) motivo = 'Protocolo não liberado pela instituição';
  else if (!p.favorito) motivo = 'Adicione o protocolo aos favoritos para defini-lo como padrão';
  else if (escopos.length === 0) motivo = 'Este protocolo não tem um escopo de uso válido';

  return { visivel: true, habilitado: motivo === null, motivo, escopos, atual: p.default_pessoal ?? null };
}

/** Desativar para a instituição (admin). */
export function regrasLiberacao(p) {
  if (!p.liberado_pela_empresa) return { liberado: false };

  let motivoDesativar = null;
  if (p.padrao_institucional) {
    motivoDesativar = `É o padrão da instituição (${rotuloEscopoUso(p.padrao_institucional)}). ` +
      'Defina outro protocolo como padrão desse escopo antes de desativar.';
  } else if (p.politica === 'obrigatorio') {
    motivoDesativar = 'Protocolo obrigatório: torne-o opcional antes de desativar.';
  }
  return { liberado: true, podeDesativar: motivoDesativar === null, motivoDesativar };
}

/**
 * Padrão da instituição (admin). Cada protocolo tem UM slot de padrão:
 * já sendo padrão de um escopo, não se move para outro (o back recusa) --
 * troca-se definindo OUTRO protocolo como padrão daquele escopo.
 */
export function regrasPadraoInstitucional(p) {
  const escopos = escoposCompativeis(p);

  if (!p.liberado_pela_empresa) {
    return { habilitado: false, motivo: 'Libere o protocolo antes de defini-lo como padrão.', escopos, atual: null };
  }
  if (p.padrao_institucional) {
    return { habilitado: false, escopos, atual: p.padrao_institucional,
      motivo: 'Já é o padrão da instituição. Para trocar, defina outro protocolo como padrão desse escopo.' };
  }
  return { habilitado: escopos.length > 0, motivo: escopos.length ? null : 'Escopo de uso inválido', escopos, atual: null };
}