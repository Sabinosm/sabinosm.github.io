// settingsLoader.js
//
// Carrega o partial compartilhado do modal de Configurações
// (settingsModal.html) e injeta no final do <body> da página atual,
// para não duplicar ~165 linhas de HTML em cada página admin
// (Home, Pacientes, Profissionais, Empresa...).
//
// settings.js assume que os elementos do modal (#settings-overlay,
// #settings-close, .settings-tab, etc.) já existem no DOM no momento
// em que roda -- ele faz document.getElementById direto no escopo
// top-level do módulo, sem esperar nenhum evento. Por isso a ordem
// aqui importa: primeiro injeta o HTML, só DEPOIS carrega settings.js
// (dinamicamente, via import()), garantindo que os elementos existam
// antes do script que os manipula rodar.
//
// Uso (no HTML de cada página admin, no lugar do antigo bloco de
// modal colado + <script src=".../settings.js">):
//
//   <script type="module" src="../../../../js/pages/user/admin/settingsLoader.js"></script>
//
// initHomePage.js/preencherPainelPerfil.js continuam funcionando sem
// mudança: eles só populam os campos depois que o modal já existe,
// e initHomePage.js roda como módulo separado, então a ordem entre
// os dois <script type="module"> não é garantida por padrão -- por
// isso preencherModal() expõe uma Promise que initHomePage.js pode
// aguardar antes de preencher os campos (ver modalConfiguracoesPronto).


const PATH = '../../../../html/pages/user/settingsModal.html';
export const modalConfiguracoesPronto = carregarModalConfiguracoes();

/**
 * Promise que resolve quando o modal de Configurações já está no DOM
 * e settings.js já rodou (listeners ligados). Outros módulos (ex:
 * preencherPainelPerfil.js) podem `await modalConfiguracoesPronto`
 * antes de tentar preencher campos do modal, evitando corrida com
 * a injeção assíncrona do HTML.
 */



async function carregarModalConfiguracoes() {
  let html;
  try {
    const resposta = await fetch(PATH);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    html = await resposta.text();
  } catch (erro) {
    console.error('settingsLoader: não foi possível carregar settingsModal.html', erro);
    return;
  }

  // Injeta como último elemento do <body>, igual à posição em que o
  // overlay ficava quando colado direto no HTML da página.
  document.body.insertAdjacentHTML('beforeend', html);

  // settings.js só é seguro de rodar agora que o HTML está no DOM.
  // Import dinâmico -- roda o módulo uma única vez (mesmo cache de
  // import estático), então não há risco de inicializar os listeners
  // duas vezes mesmo que este loader seja importado por engano em
  // mais de um lugar.
  await import('../pages/user/standartUser/settings.js');
}

