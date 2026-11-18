/* Peças e dados de exemplo do Atendimento. Os layouts só decidem COMO organizar estas peças. */
(function () {
  const I = {
    plus: '<path d="M12 5v14M5 12h14"/>', home: '<path d="M3 11l9-8 9 8v9h-6v-6H9v6H3z"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', truck: '<path d="M2 6h11v10H2zM13 10h5l4 4v2h-9z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M5 12l5 5 9-10"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  window.icon = (n, size) => '<svg class="icon" ' + (size ? 'style="width:' + size + 'px;height:' + size + 'px"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>';

  window.AWAITING = [
    { id: 131, name: 'Beatriz Nunes', hood: 'Parque das Águas', when: 'há 4 min', boxes: 0 },
    { id: 130, name: 'Lucas Ferreira', hood: 'São Lucas', when: 'há 12 min', boxes: 0 },
    { id: 129, name: 'Patrícia Barros', hood: 'Centro', when: 'há 25 min', boxes: 0 },
  ];
  window.TODAY = [
    { id: 128, name: 'Renato Silva', hood: 'Vila Nova', status: 'Pronta para planejar' },
    { id: 127, name: 'Aline Moraes', hood: 'Jardim das Flores', status: 'Em carregamento' },
    { id: 126, name: 'Eduardo Gomes', hood: 'Jardim Primavera', status: 'Em rota' },
    { id: 125, name: 'Cláudia Dias', hood: 'Parque das Águas', status: 'Entregue' },
  ];

  /* blocos de formulário */
  window.F = {
    search: () => '<div class="field"><label>Buscar cliente por telefone ou nome</label><div class="input-icon">' + icon('search') + '<input class="input" placeholder="Ex.: 00101 ou Maria"></div></div>',
    cliente: () => '<div class="grid2"><div class="field"><label>Nome</label><input class="input" value="Maria Oliveira"></div><div class="field"><label>Telefone</label><input class="input" value="(00) 90000-0101"></div></div>',
    endereco: () => '<div class="grid2"><div class="field"><label>Bairro</label><select class="input"><option>Centro</option><option>Vila Nova</option></select></div><div class="field"><label>Rua</label><input class="input" value="Rua das Acácias"></div>'
      + '<div class="field"><label>Número</label><input class="input" value="80"></div><div class="field"><label>Complemento</label><input class="input" placeholder="Casa, apto…"></div></div>'
      + '<div class="field" style="margin-top:14px"><label>Ponto de referência</label><input class="input" placeholder="Portão azul, ao lado da praça"></div>',
    janela: () => '<div class="field"><label>Janela de entrega</label><div class="seg wins"><button class="on">14:00–16:00</button><button>16:00–18:00</button><button>18:00–20:00</button></div></div>',
    extras: () => '<div class="field"><label>Observações</label><input class="input" placeholder="Algo que o motorista deve saber"></div>'
      + '<div class="row"><div><div class="t">Cliente aceita avisos por WhatsApp</div><div class="muted small">Avisamos quando a viagem começar e quando a entrega chegar.</div></div><button class="switch on" aria-label="Avisos" onclick="this.classList.toggle(\'on\')"></button></div>',
    all() { return this.search() + '<div style="height:16px"></div>' + this.cliente() + '<div style="height:14px"></div>' + this.endereco() + '<div style="height:14px"></div>' + this.janela() + '<div style="height:14px"></div>' + this.extras(); },
  };

  window.orderRow = (o) => '<div class="orow"><div><b>' + o.name + '</b><div class="muted small">#' + o.id + ' · ' + o.hood + (o.when ? ' · ' + o.when : '') + '</div></div>' + (o.status ? '<span class="badge info">' + o.status + '</span>' : '<a class="btn sm" href="#">Registrar caixas</a>') + '</div>';

  window.appShell = (inner, title, sub, actions) =>
    '<div class="app"><aside class="side"><div class="brand"><i></i>RotaCerta</div>'
    + '<a class="btn primary cta" href="#">' + icon('plus') + ' Nova entrega</a>'
    + '<a class="item" href="#">' + icon('chart') + ' Painel de gestão</a><a class="item on" href="#">' + icon('home') + ' Atendimento</a>'
    + '<a class="item" href="#">' + icon('clock') + ' Continuar atendimento</a><a class="item" href="#">' + icon('box') + ' Entregas</a>'
    + '<a class="item" href="#">' + icon('user') + ' Clientes</a><a class="item" href="#">' + icon('sliders') + ' Configurações</a>'
    + '<span class="grow"></span><a class="item" href="#">' + icon('user') + ' Sair</a></aside>'
    + '<main class="stage"><div class="stage-inner"><header class="page-head split-head"><div><h1>' + title + '</h1><p class="muted">' + sub + '</p></div>' + (actions || '') + '</header>' + inner + '</div></main></div>'
    + '<div class="hint"><span>Gostou deste layout?</span><a href="index.html">← voltar à galeria</a></div>';

  /* alterna entre "Início" e "Nova entrega" nos layouts que têm as duas telas */
  window.viewSwitch = (current, a, b) => '<div class="seg"><button class="' + (current === 'a' ? 'on' : '') + '" onclick="' + a + '">Início</button><button class="' + (current === 'b' ? 'on' : '') + '" onclick="' + b + '">Nova entrega</button></div>';
})();
