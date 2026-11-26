// 台词库。无线电短、像真实战术通信；敌人有日常感，语言混杂；隐庭的语言安静、老派。
// 每类至少 4 条，随机不重复地轮换。

export const SPEAKERS = {
  player: { name: '掠影一号', color: '#8FE3E8' },
  echo: { name: '回声', color: '#BFE9EC' },
  glimmer: { name: '微光', color: '#F3D9A0' },
  bedrock: { name: '磐石', color: '#C9D3C2' },
  court: { name: '隐庭', color: '#D8DCE0' },
  enemy: { name: '铁砧频道', color: '#E5A07B' },
  pa: { name: '值班广播', color: '#C7B79A' },
};

export const WING = {
  echo: {
    confirm: ['回声，收到。', '明白。', '照办。', '回声收到，马上。', '嗯。'],
    inPosition: ['回声，就位。', '到了。', '我在位置上。', '就位，安静得很。'],
    done: ['回声，完成。', '办妥了。', '好了，回来了。', '搞定。'],
    spotEnemy: ['十一点方向，有人。', '林缘有个哨兵，别抬头。', '左前方，一个巡逻。', '有动静，停一下。'],
    spotted: ['我被看见了。往树冠下撤。', '他们盯上我了，我先躲。', '暴露了，我自己能走。', '有人看到我了，别管我——也别完全不管。'],
    alarm: ['警报响了。按计划走。', '他们醒了。', '整个营地都亮了。', '好，现在不用小声说话了。'],
    playerScrape: ['你蹭到了，队长。', '那棵树记住你了。', '轻点。', '这下整片林子都听见了。'],
    missionDone: ['干得漂亮，队长。', '回家吧。这雨比上次那个地方还密。', '……能跟着你飞，挺好。', '一根羽毛都没掉。'],
    coneWarn: ['正前方有视线，我绕一下。', '这条路被探照灯盯着，我得等。', '过不去，换条线。', '前面有人看着，我停在这。'],
    holdBump: ['巡逻往我这边来了。', '有人靠近，我得挪一挪。', '再待下去要被撞上了。', '脚步声，很近。'],
    kill: ['倒了一个。', '清掉。', '回声，命中。', '下一个。'],
    follow: ['跟着你的航迹。', '走你走过的路。', '收到，咬住你的尾迹。', '我在你后面。'],
    hold: ['原地待命。', '我趴下了。', '安静等着。', '关小场功率，待命。'],
  },
  glimmer: {
    confirm: ['微光收到！', '好嘞，马上！', '收到收到。', '明白，这就去！'],
    inPosition: ['微光就位！随时可以。', '到了到了，这边视野很好。', '就位。我能看见整个清障带。', '位置到了，等你一句话。'],
    done: ['完成！他们全往那边看了。', '搞定，我撤回来了！', '好了好了，我回来了。', '标记完成，八秒，抓紧。'],
    spotEnemy: ['东侧塔刚转过去，你有四秒。', '那个抽烟的又出来了，在发电机房南边。', '有无人机——不对，是鸟。还是看着点。', '清障带上两个，一左一右，别贴着走。'],
    spotted: ['糟了糟了，他们看见我了！', '我被盯上了，我往林子里跑！', '队长，他们在追我！', '探照灯打到我了！我得撤！'],
    alarm: ['警报！他们在呼叫——快点快点！', '全亮了！队长，怎么办？', '他们知道了，我们得赶在上传前面！', '整个营地都在喊，我听不懂但肯定不是好话。'],
    playerScrape: ['哎，那一下我都听见了。', '队长，树！', '刚才那声太响了。', '轻一点轻一点……'],
    missionDone: ['我们做到了！我们真的做到了！', '心跳到现在还没下来。', '下次还跟你飞。', '……谢谢你没丢下我。'],
    coneWarn: ['前面有摄像头盯着，我等它转开。', '这边视线太多了，我绕远一点。', '探照灯在扫，我得等一轮。', '过不去，我换个方向。'],
    holdBump: ['有人朝我这边走过来了……', '巡逻离我越来越近了。', '队长，我得动一下了。', '要被撞见了要被撞见了。'],
    kill: ['打中了！', '微光，击倒一个！', '哈，看到没？', '又一个！'],
    follow: ['跟上你！', '跟着航迹，走你走过的。', '收到，贴着你飞。', '在你后面三秒半。'],
    hold: ['好，我不动。', '原地待命，场功率压低了。', '我在这等着。', '安静模式。'],
    coreClock: ['机库那个巡逻大概每九十秒回来一次，快点出来。', '他们迟早会发现空台子的。', '残骸台子空了，有人会去看的。', '时间不多，那个俄国人要回来了。'],
    scanHit: ['标记了，全在 HUD 上。', '看见他们了，八秒。', '扫到了，比我想的多。', '标记完毕。'],
  },
  bedrock: {
    confirm: ['磐石收到。', '收到。', '明白。', '照做。'],
    inPosition: ['磐石到位。', '就位。', '在位置上了。', '准备好了。'],
    done: ['完成。', '办好了。', '结束，撤回。', '完成，没留尾巴。'],
    spotEnemy: ['北面有车。', '注意，岗楼上有人。', '有人带着热像仪。', '那边两个，别过去。'],
    spotted: ['我暴露了，转移中。', '被看到了，我自己处理。', '他们在追我。我能撑住。', '暴露。往林里撤。'],
    alarm: ['警报。我去压终端。', '他们要上传了，我去拖住。', '干扰中，上传会慢下来。', '我会成为第二个目标，没关系。'],
    playerScrape: ['注意擦碰。', '刮到了。', '小心地面。', '响了一声。'],
    missionDone: ['任务完成。……做得好。', '平安。', '回家。', '这一程，值得。'],
    coneWarn: ['有视线，我停一停。', '前面不安全，等。', '绕行。', '过不去，换路。'],
    holdBump: ['巡逻靠近。', '我得挪一下。', '有人来了。', '再不动就迟了。'],
    kill: ['倒下。', '清除。', '磐石，命中。', '压住了。'],
    jamOn: ['干扰场展开。他们的手机只剩雪花。', '干扰开始。研究所正在变成黑箱。', '信号压住了。', '干扰场就位，我不能动了。'],
    jamOff: ['干扰场收起。', '撤掉干扰。', '干扰结束。', '收了。'],
    terminalJam: ['我在压卫星终端，上传会多花十五秒。', '终端被我拖住了。', '他们的上传在爬，我在拖。', '干扰终端中，快点。'],
    follow: ['跟随。', '跟在后面。', '收到，跟随航迹。', '在你身后。'],
    hold: ['待命。', '原地。', '我等着。', '静默待命。'],
  },
};

// 战斗指令确认
export const COMBAT_ORDERS = {
  focus: { echo: ['集火，跟你打同一个。', '盯住它。'], glimmer: ['集火！打它！', '收到，全打那个！'], bedrock: ['集火。', '压上去。'] },
  flank: { echo: ['我从侧面绕。', '包抄。'], glimmer: ['我绕到它后面！', '包抄，马上到！'], bedrock: ['侧翼。', '绕过去。'] },
  cover: { echo: ['我掩护你。', '你身边有我。'], glimmer: ['我盯着你背后！', '掩护你！'], bedrock: ['掩护。', '我挡着。'] },
  regroup: { echo: ['归队。', '回到你身边。'], glimmer: ['归队归队！', '回来了！'], bedrock: ['归队。', '回到编队。'] },
};

export const COURT = {
  briefing: [
    '灰翎，这里是隐庭。目标是坠落的侦察机里那颗场核。别让世界看见你们。',
    '研究所的人不知道自己手里拿的是什么。我们希望他们永远不知道。',
  ],
  rainEnd: ['雨要停了。天黑之后，他们的眼睛会变多。', '日落了。注意无人机。'],
  core: ['场核已入舱。回家吧，孩子们。', '我们收到了它的回声。撤离。'],
  exposedWarn: ['有影像正在上传。切断它，不惜代价。', '那段画面一旦出去，一百三十年就没了。'],
  blackbox: ['研究所已与世隔绝。现在，你们可以不再克制。', '黑箱成立。去吧。'],
  satWarn: ['十秒后卫星过顶。找树冠。', '轨道上有眼睛，十秒。'],
  satEnd: ['卫星离开了。', '天空又安静了。'],
  satCaught: ['卫星拍到了异常。评级会受影响。', '有一帧画面落在了轨道上。'],
  stormReady: ['四机共振就绪。', '方阵可以组成了。'],
};

// 敌人：多语混杂，原文 + 译文
export const BARKS = {
  idle: {
    pt: [['Porra, feijão de novo…', '靠，又是豆子饭……'], ['Essa chuva não para nunca.', '这雨就没停过。'], ['Meu turno acaba às oito.', '我八点下班。']],
    es: [['¿Alguien vio mi cargador?', '谁看见我的充电器了？'], ['Este sitio me da escalofríos.', '这地方让我发毛。'], ['Otra noche de mosquitos.', '又是喂蚊子的一晚。']],
    en: [['Signal\'s garbage out here.', '这破地方信号真烂。'], ['Who parked the truck on the cable again?', '谁又把车停在电缆上了？'], ['Two more weeks. Two more weeks.', '再熬两周。就两周。']],
    ru: [['Опять этот дождь.', '又是这场雨。'], ['Кофе кончился, представляешь?', '咖啡没了，你敢信？'], ['Кто-нибудь видел сержанта?', '有人见到中士了吗？']],
  },
  suspicious: {
    pt: [['Ouviu isso?', '你听到了吗？'], ['Que porra é essa?', '那是什么鬼？']],
    es: [['¿Qué fue eso?', '那是什么？'], ['Espera… algo se movió.', '等等……有东西动了。']],
    en: [['Hold up. You see that?', '等一下。你看见了吗？'], ['Something\'s out there.', '外面有东西。']],
    ru: [['Что это было?', '那是什么？'], ['Стой. Там что-то есть.', '站住。那边有东西。']],
  },
  search: {
    pt: [['Vou dar uma olhada.', '我过去看看。'], ['Cobre aí, vou checar.', '掩护我，我去查一下。']],
    es: [['Voy a revisar.', '我去查查。'], ['Mantente alerta.', '都打起精神。']],
    en: [['Moving to check it out.', '我去确认一下。'], ['Base, checking a contact.', '总部，我去查一个目标。']],
    ru: [['Проверю.', '我去查。'], ['Иду смотреть.', '我过去看看。']],
  },
  calm: {
    pt: [['Deve ser macaco.', '大概是猴子。'], ['Nada. Paranoia.', '没东西。疑神疑鬼。']],
    es: [['Nada. Pájaros, seguro.', '没什么。肯定是鸟。'], ['Falsa alarma.', '虚惊一场。']],
    en: [['Nothing. Just the rain.', '没东西。就是雨。'], ['Probably a capybara.', '估计是水豚。']],
    ru: [['Ничего. Показалось.', '没什么。看错了。'], ['Ветер, наверное.', '大概是风。']],
  },
  alarm: {
    pt: [['Contato! Contato!', '有目标！有目标！'], ['Tá aqui! Tá bem aqui!', '在这！就在这！']],
    es: [['¡Contacto!', '发现目标！'], ['¡Ahí está! ¡Disparen!', '在那！开火！']],
    en: [['Contact! Light it up!', '发现目标！开火！'], ['It\'s real! It\'s real!', '是真的！是真的！']],
    ru: [['Контакт!', '接敌！'], ['Огонь! Огонь!', '开火！开火！']],
  },
  phone: {
    pt: [['Tô filmando, tô filmando…', '我在拍，我在拍……']],
    es: [['Lo estoy grabando.', '我在录。']],
    en: [['Getting this on camera.', '我拍下来了。']],
    ru: [['Снимаю.', '我在拍。']],
  },
  wake: {
    pt: [['…o que eu tava fazendo?', '……我刚才在干嘛？']],
    es: [['¿Me quedé dormido?', '我睡着了？']],
    en: [['…did I just zone out?', '……我刚才走神了？']],
    ru: [['…что я тут делал?', '……我在这干什么来着？']],
  },
  static: {
    pt: [['Rádio tá chiando…', '对讲机在沙沙响……']],
    es: [['La radio hace ruido raro.', '对讲机声音不对劲。']],
    en: [['Radio\'s acting up.', '对讲机出毛病了。']],
    ru: [['Рация шипит.', '对讲机在嘶嘶响。']],
  },
  core: {
    pt: [['Cadê a peça?! Sumiu!', '那东西呢？！不见了！']],
    es: [['¡El dron no está!', '无人机残骸没了！']],
    en: [['The wreck is gone! Lock it down!', '残骸不见了！封锁！']],
    ru: [['Обломки пропали!', '残骸不见了！']],
  },
  hit: {
    pt: [['Ai, merda!', '啊，该死！']], es: [['¡Me dieron!', '我中弹了！']], en: [['I\'m hit!', '我中了！']], ru: [['Ранен!', '我受伤了！']],
  },
};

export const PA = [
  ['Equipe B, refeitório em dez minutos.', 'B 班，十分钟后到食堂。'],
  ['Attention: generator maintenance at nineteen hundred.', '注意：十九点发电机检修。'],
  ['Lembrete: celulares fora do laboratório.', '提醒：手机不得带入实验楼。'],
  ['Night shift, report to the gate.', '夜班人员，到大门报到。'],
  ['Hangar access restricted. Authorized personnel only.', '机库限制进入。仅限授权人员。'],
];

export const ENEMY_RADIO = {
  radarContact: [['Radar has a return, south sector.', '雷达南区有回波。'], ['Got a blip on radar.', '雷达上有个光点。']],
  emSpike: [['Spectrum spike near the culvert.', '涵洞附近频谱尖峰。'], ['EM sensors are lighting up.', '电磁传感器在跳。']],
  cameraFlag: [['Camera three, movement.', '三号摄像头，有移动。'], ['Something on the feed.', '画面里有东西。']],
  pulse: [['Power\'s out! What the hell?', '停电了！搞什么？'], ['Everything just died!', '所有东西都断了！']],
  upload: [['Uplink started. Get that footage out.', '上行开始。把画面发出去。'], ['Sending it to HQ now.', '正在发给总部。']],
  uploadCut: [['Uplink\'s down! Reboot it!', '上行断了！重启！'], ['Terminal\'s dead!', '终端没反应了！']],
  jam: [['Radios are all static!', '对讲机全是杂音！'], ['Cell signal\'s gone.', '手机没信号了。']],
  heli: [['Kestrel inbound. Two minutes.', '红隼直升机正在赶来，两分钟。'], ['Air support is on the way.', '空中支援在路上。']],
  cars: [['Rolling out. Block the roads.', '出车。封锁道路。'], ['Units moving to the tree line.', '车辆前往林线。']],
  swarm: [['Launch the swarm!', '放无人机群！'], ['FPVs up!', '穿越机起飞！']],
  noSwarm: [['Too much rain for the drones!', '雨太大，无人机飞不了！']],
};

export function makePicker(seed = 1) {
  const used = new Map();
  return function pick(key, arr) {
    if (!arr || arr.length === 0) return null;
    let last = used.get(key);
    let i = (seed = (seed * 16807) % 2147483647) % arr.length;
    if (arr.length > 1 && i === last) i = (i + 1) % arr.length;
    used.set(key, i);
    return arr[i];
  };
}
