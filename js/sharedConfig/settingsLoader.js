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
const QRCODE_LIB_PATH = './vendor/qrcode.min.js'; // ajuste o caminho real

export const modalConfiguracoesPronto = carregarModalConfiguracoes();

/**
 * Garante que window.QRCode existe, carregando a lib sob demanda se
 * ainda não estiver no documento. Assim o módulo de TOTP deixa de
 * depender de cada página host lembrar de incluir o <script> da lib
 * -- essa responsabilidade passa a ser inteiramente do próprio
 * settingsLoader/settings.js.
 */
function carregarLibQrCode() {
  if (typeof window.QRCode !== 'undefined') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = QRCODE_LIB_PATH;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${QRCODE_LIB_PATH}`));
    document.head.appendChild(script);
  });
}

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

  document.body.insertAdjacentHTML('beforeend', html);

  // Carrega a lib QR em paralelo com a importação de settings.js --
  // não precisa ser sequencial, já que settings.js só usa a lib
  // depois que o usuário clica em "Configurar" (aguardarLibQrCode
  // ainda cobre o caso de ela não ter terminado a tempo).
  const libQrCodePromise = carregarLibQrCode().catch((erro) => {
    console.error('settingsLoader: não foi possível carregar a lib QRCode', erro);
  });

  await import('../pages/user/standartUser/settings.js');
  await libQrCodePromise;
}

