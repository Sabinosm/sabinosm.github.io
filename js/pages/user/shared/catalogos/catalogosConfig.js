// catalogosConfig.js
//
// Blocos de configuração da página de detalhe:
//
//   - "Minha configuração" (médico/enfermeiro -- o back manda favorito
//     null aos demais): favorito e padrão pessoal.
//   - "Governança da instituição" (is_admin): liberar/desativar, política
//     (opcional/obrigatório) e padrão da instituição.
//
// Recebem o resumo (o mesmo formato dos cards) e se redesenham por inteiro
// a cada chamada -- a página os chama de novo quando EVENTO_ATUALIZADO
// dispara. As regras de habilitação vêm de catalogosRegras.js e a
// execução das ações de catalogosAcoes.js. Esta página NÃO executa
// protocolos: isso vive na página de consultas.
//
// Esperam no HTML: #config-pessoal / #config-pessoal-corpo e
// #config-admin / #config-admin-corpo (seções começam `hidden`).

import { POLITICAS, rotuloEscopoUso, rotuloOpcaoPolitica } from "./catalogosLabels.js";
import { souAdmin } from "./catalogosSessao.js";
import {
  alterarLiberacao,
  alternarFavorito,
  definirDefaultPessoal,
  definirPadraoInstitucional,
  removerDefaultPessoal,
} from "./catalogosAcoes.js";
import {
  regrasEstrela,
  regrasLiberacao,
  regrasPadraoInstitucional,
  regrasPadraoPessoal,
} from "./catalogosRegras.js";
import { comTrava, confirmar, criarBotao, criarSelect } from "./catalogosUi.js";

// ============================================
// Bloco "Minha configuração" (médico/enfermeiro)
// ============================================
export function renderizarConfigPessoal(p) {
  const secao = document.getElementById('config-pessoal');
  const corpo = document.getElementById('config-pessoal-corpo');
  if (!secao || !corpo || !p) return;

  const estrela = regrasEstrela(p);
  secao.hidden = !estrela.visivel;
  corpo.innerHTML = '';
  if (!estrela.visivel) return;

  // --- Favorito ---
  const btnFavorito = criarBotao(
    estrela.cheia ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
    'btn-ghost',
    {
      desabilitado: !estrela.habilitada,
      titulo: estrela.titulo,
      onClick: (btn) => comTrava(btn, () => alternarFavorito(p)),
    },
  );
  corpo.appendChild(criarLinha(
    'Favorito',
    p.favorito
      ? 'Este protocolo está entre os seus favoritos.'
      : 'Favoritos aparecem em destaque na consulta. Não bloqueiam nada: só organizam a sua tela.',
    [btnFavorito],
  ));

  // --- Padrão pessoal ---
  const regras = regrasPadraoPessoal(p);
  const select = criarSelect(
    regras.escopos.map(e => ({ valor: e, rotulo: rotuloEscopoUso(e) })),
    regras.atual ?? regras.escopos[0],
    !regras.habilitado,
  );
  const btnDefinir = criarBotao('Definir como meu padrão', 'btn-ghost', {
    titulo: regras.motivo ?? '',
    onClick: (btn) => comTrava(btn, () => definirDefaultPessoal(p, select.value)),
  });
  const atualizarBotao = () => {
    btnDefinir.disabled = !regras.habilitado || select.value === regras.atual;
  };
  select.addEventListener('change', atualizarBotao);
  atualizarBotao();

  const controles = [select, btnDefinir];
  if (regras.atual) {
    controles.push(criarBotao('Voltar ao padrão da instituição', 'btn-ghost', {
      onClick: (btn) => comTrava(btn, () => removerDefaultPessoal(p)),
    }));
  }
  corpo.appendChild(criarLinha(
    'Padrão pessoal',
    regras.atual
      ? `É o seu padrão para: ${rotuloEscopoUso(regras.atual)}.`
      : 'Carregado automaticamente na consulta. Sem escolha sua, vale o padrão da instituição.',
    controles,
    !regras.habilitado ? regras.motivo : null,
  ));
}

// ============================================
// Bloco "Governança da instituição" (admin)
// ============================================
export function renderizarConfigAdmin(p) {
  const secao = document.getElementById('config-admin');
  const corpo = document.getElementById('config-admin-corpo');
  if (!secao || !corpo || !p) return;

  const admin = souAdmin();
  secao.hidden = !admin;
  corpo.innerHTML = '';
  if (!admin) return;

  // --- Liberação + política ---
  const lib = regrasLiberacao(p);
  const politicaAtual = p.politica || 'opcional';
  const selPolitica = criarSelect(
    POLITICAS.map(v => ({ valor: v, rotulo: rotuloOpcaoPolitica(v) })),
    politicaAtual,
  );
  const controlesLiberacao = [selPolitica];

  if (!lib.liberado) {
    controlesLiberacao.push(criarBotao('Liberar para a instituição', 'btn-primary', {
      onClick: (btn) => comTrava(btn, () =>
        alterarLiberacao(p, { ativo: true, politica: selPolitica.value })),
    }));
  } else {
    const btnPolitica = criarBotao('Aplicar política', 'btn-ghost', {
      desabilitado: true, // habilita quando o seletor muda
      onClick: (btn) => comTrava(btn, () =>
        alterarLiberacao(p, { ativo: true, politica: selPolitica.value })),
    });
    selPolitica.addEventListener('change', () => {
      btnPolitica.disabled = selPolitica.value === politicaAtual;
    });
    controlesLiberacao.push(btnPolitica);

    controlesLiberacao.push(criarBotao('Desativar', 'btn-ghost', {
      desabilitado: !lib.podeDesativar,
      titulo: lib.motivoDesativar ?? '',
      onClick: (btn) => comTrava(btn, async () => {
        const ok = await confirmar({
          titulo: 'Desativar protocolo?',
          texto: `«${p.nome_protocolo}» deixará de estar disponível para toda a instituição. ` +
            'Os favoritos dos profissionais são preservados.',
          rotuloConfirmar: 'Desativar',
        });
        if (ok) await alterarLiberacao(p, { ativo: false });
      }),
    }));
  }

  corpo.appendChild(criarLinha(
    'Liberação e política',
    lib.liberado
      ? 'Liberado. "Obrigatório" impede que os profissionais tirem o protocolo dos favoritos.'
      : 'Não liberado. Escolha a política e libere: "obrigatório" impede que os profissionais tirem o protocolo dos favoritos.',
    controlesLiberacao,
    lib.liberado && !lib.podeDesativar ? lib.motivoDesativar : null,
  ));

  // --- Padrão da instituição ---
  const padrao = regrasPadraoInstitucional(p);
  const selEscopo = criarSelect(
    padrao.escopos.map(e => ({ valor: e, rotulo: rotuloEscopoUso(e) })),
    padrao.atual ?? padrao.escopos[0],
    !padrao.habilitado,
  );
  const btnPadrao = criarBotao('Definir como padrão da instituição', 'btn-ghost', {
    desabilitado: !padrao.habilitado,
    titulo: padrao.motivo ?? '',
    onClick: (btn) => comTrava(btn, async () => {
      const escopo = selEscopo.value;
      const ok = await confirmar({
        titulo: 'Definir padrão da instituição?',
        texto: `«${p.nome_protocolo}» passa a ser o padrão de "${rotuloEscopoUso(escopo)}" ` +
          'para quem não escolheu o próprio. Substitui o padrão atual desse escopo.',
        rotuloConfirmar: 'Definir padrão',
      });
      if (ok) await definirPadraoInstitucional(p, escopo);
    }),
  });
  corpo.appendChild(criarLinha(
    'Padrão da instituição',
    padrao.atual
      ? `É o padrão da instituição para: ${rotuloEscopoUso(padrao.atual)}. Não pode ser desativado.`
      : 'Usado como padrão por quem não escolheu o próprio.',
    [selEscopo, btnPadrao],
    !padrao.habilitado ? padrao.motivo : null,
  ));
}

/** Linha de configuração: título, nota, controles e (opcional) motivo de bloqueio. */
function criarLinha(titulo, nota, controles, motivoBloqueio = null) {
  const linha = document.createElement('div');
  linha.className = 'catalogo-config-linha';

  const t = document.createElement('span');
  t.className = 'catalogo-config-titulo';
  t.textContent = titulo;

  const n = document.createElement('p');
  n.className = 'catalogo-config-nota';
  n.textContent = nota;

  const c = document.createElement('div');
  c.className = 'catalogo-config-controles';
  c.append(...controles);

  linha.append(t, n, c);

  if (motivoBloqueio) {
    const m = document.createElement('p');
    m.className = 'catalogo-config-nota';
    m.textContent = motivoBloqueio;
    linha.appendChild(m);
  }
  return linha;
}