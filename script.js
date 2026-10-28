/* =========================================================
   ATALHOS E FUNÇÕES AUXILIARES
   ========================================================= */
const $ = id => document.getElementById(id);                 // atalho para getElementById
const fmt = d => d.toLocaleDateString('sv-SE');              // data em "AAAA-MM-DD" (chave de cada dia)
const hojeStr = () => fmt(new Date());
const ontemStr = () => fmt(new Date(Date.now() - 864e5));    // 864e5 ms = 1 dia
const paraMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };  // "06:30" -> 390
const agoraMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const META_AGUA = 4;                                         // copos para a Água acender

/* =========================================================
   ESTADO SALVO (fica guardado no navegador)
   ========================================================= */
const padrao = {
  config: { acordar: '06:00', refeicao: '08:00', dormir: '22:30', intervalo: 120 },
  streak: 0, ultimoDiaCompleto: null, dias: {}
};
let estado = padrao;
try {
  const salvo = JSON.parse(localStorage.getItem('avatar') || '{}');
  estado = { ...padrao, ...salvo, config: { ...padrao.config, ...(salvo.config || {}) } };
} catch (e) { estado = padrao; }
const salvar = () => { try { localStorage.setItem('avatar', JSON.stringify(estado)); } catch (e) {} };

// Registro de HOJE (cria zerado se não existir)
function diaAtual() {
  const h = hojeStr();
  if (!estado.dias[h]) estado.dias[h] = { ar: false, terra: false, agua: 0, fogo: false };
  return estado.dias[h];
}
// Resume o dia em 4 verdadeiro/falso (a água só vale ao bater a meta)
const elementos = d => ({ ar: d.ar, terra: d.terra, agua: d.agua >= META_AGUA, fogo: d.fogo });

/* =========================================================
   TELAS E MENU
   ========================================================= */
document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.menu button').forEach(x => x.classList.toggle('ativo', x === b));
  document.querySelectorAll('.tela').forEach(t => t.classList.add('oculta'));
  $('tela-' + b.dataset.tela).classList.remove('oculta');
  if (b.dataset.tela === 'historico') renderHistorico();
}));

// Atualiza a tela inicial. Devolve true se os 4 elementos estão feitos
function atualizarTela() {
  const d = diaAtual(), el = elementos(d);

  // Liga/desliga a classe "on" em cada cartão: é ela que dispara as animações do CSS
  for (const k in el) $('card-' + k).classList.toggle('on', el[k]);

  // Nível da gota de água (0 a 4 copos) -> variável CSS --n
  $('card-agua').style.setProperty('--n', Math.min(d.agua, META_AGUA));

  // Sequência zera se passou um dia sem completar
  const u = estado.ultimoDiaCompleto;
  if (u && u !== hojeStr() && u !== ontemStr()) estado.streak = 0;
  $('streak').textContent = estado.streak;

  // Todos feitos? A seta acende de cima para baixo (classe "completo")
  const todos = Object.values(el).every(Boolean);
  $('streak-box').classList.toggle('completo', todos);
  return todos;
}

// Soma 1 na sequência quando o dia é completado (só uma vez por dia)
function verificarSequencia(todos) {
  if (todos && estado.ultimoDiaCompleto !== hojeStr()) {
    estado.streak = estado.ultimoDiaCompleto === ontemStr() ? estado.streak + 1 : 1;
    estado.ultimoDiaCompleto = hojeStr();
  }
}

// Monta a lista dos últimos 7 dias
function renderHistorico() {
  const box = $('lista-hist');
  box.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.now() - i * 864e5);
    const d = estado.dias[fmt(dt)];
    const ok = d ? Object.values(elementos(d)) : [false, false, false, false];
    const linha = document.createElement('div');
    linha.className = 'dia' + (ok.every(Boolean) ? ' completo' : '');
    const nome = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const pontos = ok.map((v, k) => `<i class="${['ar', 'terra', 'agua', 'fogo'][k]}${v ? ' on' : ''}"></i>`).join('');
    linha.innerHTML = `<span>${nome}</span><span class="pontos">${pontos}</span>`;
    box.appendChild(linha);
  }
}

/* =========================================================
   AR e TERRA: acendem sozinhos no horário
   ========================================================= */
function verificarHorarios() {
  const d = diaAtual(), c = estado.config, agora = agoraMin();
  if (agora >= paraMin(c.acordar) && agora < paraMin(c.dormir)) d.ar = true;
  if (agora >= paraMin(c.refeicao) && agora < paraMin(c.dormir)) d.terra = true;
}

/* =========================================================
   ÁGUA: alarme com arraste circular
   ========================================================= */
let proximoAgua = null, timerAlarme = null;

// Próximo lembrete = agora (ou hora de acordar) + intervalo
function agendarAgua() {
  proximoAgua = Math.max(agoraMin(), paraMin(estado.config.acordar)) + Number(estado.config.intervalo);
}
function verificarAgua() {
  if (proximoAgua !== null && agoraMin() >= proximoAgua &&
      agoraMin() < paraMin(estado.config.dormir) && $('alarme').classList.contains('oculta')) tocarAlarme();
}
function tocarAlarme() {
  $('alarme').classList.remove('oculta');
  zerarDial();                                                    // começa com o anel vazio e a bolinha no topo
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  if ('Notification' in window && Notification.permission === 'granted') new Notification('💧 Hora de beber água!');
  clearTimeout(timerAlarme);
  timerAlarme = setTimeout(() => desligarAlarme(false), 60000);   // desliga sozinho em 1 min, sem contar copo
}
function desligarAlarme(arrastou) {
  clearTimeout(timerAlarme);
  $('alarme').classList.add('oculta');
  if (arrastou) diaAtual().agua++;                                // volta completa = +1 copo
  agendarAgua();
  ciclo();
}

/* ---------- DIAL CIRCULAR do alarme ---------- */
const dial = $('dial');
const RAIO = 104;                       // raio do anel (igual ao r do círculo no HTML)
const CIRC = 2 * Math.PI * RAIO;        // comprimento do círculo (para desenhar o anel azul)
let prog = 0;                           // progresso da volta: 0 (início) a 1 (volta completa)
let arrastando = false, travado = false, ultimoAng = 0, animVolta = 0;

// Desenha tudo conforme o progresso atual
function desenharDial() {
  dial.style.setProperty('--p', prog);                                  // o CSS usa --p para subir a água
  $('progresso').style.strokeDashoffset = CIRC * (1 - prog);            // anel azul "enche"
  $('progresso').style.opacity = prog > 0.004 ? 1 : 0;                  // esconde o anel quando está zerado
  const a = prog * 2 * Math.PI;                                         // ângulo da bolinha (0 = topo, horário)
  $('puxador').setAttribute('transform', `translate(${120 + RAIO * Math.sin(a)} ${120 - RAIO * Math.cos(a)})`);
  dial.setAttribute('aria-valuenow', Math.round(prog * 100));
}

// Ângulo (em radianos) do dedo/mouse em relação ao centro do disco. 0 = topo, cresce no sentido horário
function anguloDoPonteiro(e) {
  const r = dial.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  return Math.atan2(dx, -dy);
}

// Ao tocar: só começa a arrastar se o dedo estiver perto da bolinha (tolerância de ~50°)
dial.addEventListener('pointerdown', e => {
  if (travado) return;
  const ang = anguloDoPonteiro(e);
  let d = ang - prog * 2 * Math.PI;
  d = Math.atan2(Math.sin(d), Math.cos(d));          // normaliza a diferença para -180° a 180°
  if (Math.abs(d) > 0.9) return;                     // longe da bolinha: ignora
  arrastando = true; ultimoAng = ang;
  dial.setPointerCapture(e.pointerId);               // continua recebendo o movimento mesmo se o dedo sair do disco
  cancelAnimationFrame(animVolta);
});

// Ao mover: soma quanto o dedo girou desde o último movimento (assim a volta é contínua)
dial.addEventListener('pointermove', e => {
  if (!arrastando) return;
  const ang = anguloDoPonteiro(e);
  let d = ang - ultimoAng;
  if (d > Math.PI) d -= 2 * Math.PI;                 // passou pelo topo: corrige o "salto" de 360°
  else if (d < -Math.PI) d += 2 * Math.PI;
  ultimoAng = ang;
  prog = Math.min(1, Math.max(0, prog + d / (2 * Math.PI)));   // limita entre 0 e 1
  desenharDial();
  if (prog >= 0.98) concluirDial();                  // quase uma volta completa: desliga
});

// Ao soltar antes de completar: a água desce e a bolinha volta ao topo
const soltar = () => { if (!arrastando) return; arrastando = false; if (!travado) voltarDial(); };
dial.addEventListener('pointerup', soltar);
dial.addEventListener('pointercancel', soltar);

// Teclado (acessibilidade): setas avançam e voltam 5% por vez
dial.addEventListener('keydown', e => {
  const passo = { ArrowRight: .05, ArrowUp: .05, ArrowLeft: -.05, ArrowDown: -.05 }[e.key];
  if (!passo || travado) return;
  e.preventDefault();
  prog = Math.min(1, Math.max(0, prog + passo));
  desenharDial();
  if (prog >= 0.98) concluirDial();
});

// Animação de volta ao início (0,45 s, suave)
function voltarDial() {
  const inicio = prog, t0 = performance.now();
  const passo = t => {
    const k = Math.min(1, (t - t0) / 450);
    prog = inicio * (1 - k * k * (3 - 2 * k));       // suavização (começa e termina devagar)
    desenharDial();
    if (k < 1) animVolta = requestAnimationFrame(passo);
  };
  animVolta = requestAnimationFrame(passo);
}

// Zera o dial (usado quando o alarme começa)
function zerarDial() {
  cancelAnimationFrame(animVolta);
  travado = false; arrastando = false; prog = 0;
  desenharDial();
}

// Volta completa: enche a água, espera um instante para você ver, e desliga contando 1 copo
function concluirDial() {
  if (travado) return;
  travado = true; arrastando = false;
  prog = 1; desenharDial();
  setTimeout(() => { if (!$('alarme').classList.contains('oculta')) desligarAlarme(true); }, 350);
}
desenharDial();   // posiciona a bolinha no topo assim que o app abre

/* =========================================================
   FOGO: foto da atividade física (reconhecimento com IA)
   ========================================================= */

// Endereços das bibliotecas de IA. Elas só são baixadas quando a pessoa vai enviar a 1ª foto,
// para o app abrir rápido
const URL_TFJS  = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const URL_COCO  = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
const URL_MOBNET = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js';

// O que cada IA precisa ver para considerar "atividade física".
// FORTES: sozinhos já valem. FRACOS: só valem se também houver uma pessoa na foto
const COCO_FORTES = ['sports ball', 'tennis racket', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'skis', 'snowboard'];
const COCO_FRACOS = ['bicycle', 'kite', 'frisbee'];
const MOB_FORTES = ['basketball', 'soccer ball', 'volleyball', 'tennis ball', 'rugby ball', 'golf ball', 'ping-pong ball',
  'croquet ball', 'punching bag', 'dumbbell', 'barbell', 'horizontal bar', 'parallel bars', 'balance beam', 'racket',
  'racquet', 'ski', 'snorkel', 'swimming trunks', 'maillot', 'ballplayer', 'scuba diver', 'mountain bike',
  'bicycle-built-for-two', 'unicycle', 'canoe', 'paddle'];
const MOB_FRACOS = ['running shoe', 'stopwatch', 'whistle', 'alp', 'cliff', 'valley', 'lakeside', 'seashore', 'promontory', 'sandbar'];

// Carrega um arquivo .js da internet e avisa quando terminou
const carregarScript = url => new Promise((ok, erro) => {
  const s = document.createElement('script');
  s.src = url; s.onload = ok;
  s.onerror = () => erro(new Error('Falha ao carregar ' + url));
  document.head.appendChild(s);
});

// Baixa as IAs uma única vez e guarda o resultado (as próximas fotos são rápidas)
let promessaModelos = null;
function carregarModelos() {
  if (!promessaModelos) {
    promessaModelos = (async () => {
      const m = { coco: null, mob: null };
      try {
        await carregarScript(URL_TFJS);
        // cada IA é carregada separada: se uma falhar, a outra ainda funciona
        try { await carregarScript(URL_COCO); m.coco = await cocoSsd.load(); } catch (e) { console.warn('COCO-SSD:', e); }
        try { await carregarScript(URL_MOBNET); m.mob = await mobilenet.load({ version: 2, alpha: 1.0 }); } catch (e) { console.warn('MobileNet:', e); }
      } catch (e) { console.warn('TensorFlow.js:', e); }
      return m;
    })();
    // Se nenhuma IA carregou (ex.: sem internet), esquece o resultado para tentar de novo na próxima foto
    promessaModelos.then(m => { if (!m.coco && !m.mob) promessaModelos = null; });
  }
  return promessaModelos;
}

// Analisa a foto. Devolve true (é atividade física), false (não é) ou null (IA indisponível)
async function analisarFoto(arq) {
  const { coco, mob } = await carregarModelos();
  if (!coco && !mob) return null;

  const url = URL.createObjectURL(arq);          // endereço temporário da foto no aparelho
  try {
    const img = new Image();
    img.src = url;
    await img.decode();                          // espera a imagem carregar

    let pessoa = false, pontos = 0;

    // IA 1 (COCO-SSD): procura pessoas e equipamentos. Só considera se tiver 50% ou mais de certeza
    if (coco) {
      for (const o of await coco.detect(img)) {
        if (o.score < 0.5) continue;
        if (o.class === 'person') pessoa = true;
        else if (COCO_FORTES.includes(o.class)) pontos += 2;
        else if (COCO_FRACOS.includes(o.class)) pontos += 1;
      }
    }

    // IA 2 (MobileNet): dá os 5 palpites mais prováveis sobre o que há na foto
    if (mob) {
      for (const p of await mob.classify(img, 5)) {
        if (p.probability < 0.15) continue;      // ignora palpites fracos
        // o nome vem com sinônimos separados por vírgula ("racket, racquet"): comparamos um a um
        const nomes = p.className.toLowerCase().split(',').map(s => s.trim());
        if (nomes.some(n => MOB_FORTES.includes(n))) pontos += 2;
        else if (nomes.some(n => MOB_FRACOS.includes(n))) pontos += 1;
      }
    }

    console.log('Fogo:', { pessoa, pontos });    // aparece no console (F12) para você ajustar as regras
    // Aceita se achou algo forte, ou algo fraco junto com uma pessoa
    return pontos >= 2 || (pessoa && pontos >= 1);
  } finally {
    URL.revokeObjectURL(url);                    // libera a memória da foto
  }
}

// Mostra uma mensagem curta no botão e depois volta ao normal
function mensagemBotao(texto) {
  $('btn-foto').textContent = texto;
  setTimeout(() => { $('btn-foto').textContent = '📷 Enviar foto'; }, 3500);
}

// Ao clicar no botão: abre a câmera e, ao mesmo tempo, já começa a baixar as IAs
$('btn-foto').addEventListener('click', () => { $('foto').click(); carregarModelos(); });

// Quando uma foto é escolhida:
$('foto').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';                           // limpa o campo para poder enviar outra foto depois
  if (!arq || !arq.type.startsWith('image/')) return;

  $('btn-foto').disabled = true;
  $('btn-foto').textContent = 'Analisando…';
  let resultado = false;
  try { resultado = await analisarFoto(arq); } catch (err) { console.warn('Erro na análise:', err); }
  $('btn-foto').disabled = false;

  if (resultado === true) {                      // reconheceu: acende o Fogo
    $('btn-foto').textContent = '📷 Enviar foto';
    diaAtual().fogo = true;
    ciclo();
  } else if (resultado === null) {               // IA não carregou (sem internet?)
    mensagemBotao('Sem internet. Tente de novo');
  } else {                                       // carregou, mas não viu atividade física
    mensagemBotao('Não reconhecido.');
  }
});

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */
function carregarConfig() {
  const c = estado.config;
  $('cfg-acordar').value = c.acordar; $('cfg-refeicao').value = c.refeicao;
  $('cfg-dormir').value = c.dormir;   $('cfg-intervalo').value = c.intervalo;
}
['acordar', 'refeicao', 'dormir', 'intervalo'].forEach(k =>
  $('cfg-' + k).addEventListener('change', e => {
    if (!e.target.value) return;
    estado.config[k] = e.target.value;
    agendarAgua(); ciclo();
  }));
$('btn-notif').addEventListener('click', () => { if ('Notification' in window) Notification.requestPermission(); });
$('btn-teste').addEventListener('click', tocarAlarme);

/* =========================================================
   CICLO PRINCIPAL (roda a cada 15 s)
   ========================================================= */
function ciclo() {
  verificarHorarios();
  verificarAgua();
  verificarSequencia(atualizarTela());
  atualizarTela();     // de novo, já com a sequência recalculada
  salvar();
}
carregarConfig();
agendarAgua();
ciclo();
setInterval(ciclo, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ciclo(); });

/* =========================================================
   CONFETE (comemoração ao acender)
   ========================================================= */
function confete(origem, qtd = 26) {
  const r = origem.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;      // centro do elemento
  const cores = ['#ffc800', '#58cc02', '#1cb0f6', '#ff6a2b', '#ce82ff'];
  for (let i = 0; i < qtd; i++) {
    const p = document.createElement('i');
    p.className = 'confete';
    const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 130;   // direção e alcance sorteados
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${cores[i % cores.length]};` +
      `--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 60}px;--g:${Math.random() * 720 - 360}deg`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
}

// Vigia cada cartão: quando ele ACENDE agora (não ao abrir o app), solta confete
const acesos = new Set();
document.querySelectorAll('.card').forEach(c => {
  if (c.classList.contains('on')) acesos.add(c.id);
  new MutationObserver(() => {
    const on = c.classList.contains('on');
    if (on && !acesos.has(c.id)) {
      acesos.add(c.id);
      confete(c);
      if (navigator.vibrate) navigator.vibrate(40);
      // Os 4 acesos: chuva maior de confete saindo da seta, quando ela termina de acender
      if (document.querySelectorAll('.card.on').length === 4) setTimeout(() => confete($('streak-box'), 80), 1200);
    }
    if (!on) acesos.delete(c.id);
  }).observe(c, { attributes: true, attributeFilter: ['class'] });
});
