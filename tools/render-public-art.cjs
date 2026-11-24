// 只用于排版公开宣传图，不会被打包进油猴脚本，也不读取聊天或账号数据。
// 需要 Node.js 和 sharp。直接运行本文件可重建图片；也可传入一张新的无文字插画。
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const images = fs.realpathSync(path.join(__dirname, "..", "docs", "images"));
const stem = "seatalk-sticker-helper-banner.";
const coverName = "seatalk-sticker-helper-social.png";
const sealIcon = fs.readFileSync(path.join(__dirname, "quick-picker-seal.png")).toString("base64");
const fonts = "'Inter','Segoe UI','PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
const colors = {
  ink:"#0d1830", panel:"#050b21", border:"#34455c", cream:"#fff4e5",
  body:"#d1dcec", muted:"#aabed4", mint:"#96edce", coral:"#ffb4a6", lilac:"#cbbaff",
};

// 文字与插画分开保存：中英文共用一张插画，翻译或发新版时不必重新画。
const labels = {
  zh: ["SeaTalk 表情助手", "聊天工具栏", "点一张发送，按分组整理收藏。", "挥手", "管理表情"],
  en: ["SeaTalk Sticker Helper", "CHAT TOOLBAR", "Click to send. Organize favorites by group.", "Wave", "Manage stickers"],
};

function xml(s) { return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function label(x, y, size, value, color, weight = 400, extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${xml(value)}</text>`;
}

// 几何和图标固定，语言只影响文案和必要的字号。
function quickControls(x, y, query, manage) {
  return `<g transform="translate(${x} ${y})">
    <rect width="204" height="52" rx="14" fill="#182943" stroke="#476275"/>
    <g fill="none" stroke="${colors.mint}" stroke-width="2.8" stroke-linecap="round">
      <circle cx="28" cy="24" r="7"/><path d="m34 30 5 5"/>
    </g>
    ${label(52,34,22,query,colors.cream,600)}
    <g transform="translate(220 0)">
      <rect width="252" height="52" rx="14" fill="#241f3d" stroke="#574968"/>
      <path d="M21 16h9l4 4h12v15H21z" fill="none" stroke="${colors.lilac}" stroke-width="2.4" stroke-linejoin="round"/>
      ${label(56,34,21,manage,colors.cream,600)}
    </g>
  </g>`;
}

function quickPickerIcon(x, y, size) {
  return `<image x="${x}" y="${y}" width="${size}" height="${size}" xlink:href="data:image/png;base64,${sealIcon}"/>`;
}

function drawing(art, lang, social = false) {
  const [title, section, desc, query, manage] = labels[lang];
  const [w,h] = social ? [1280,640] : [1200,360];
  const [ax,ay,aw] = social ? [552,57,778] : [621,-20,584];
  const ah = aw*2/3;
  const accessibleTitle = social ? "SeaTalk 表情助手 / SeaTalk Sticker Helper" : title;
  const accessibleDescription = social ? labels.zh[2]+" "+labels.en[2] : desc;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title note">
    <title id="title">${accessibleTitle}</title><desc id="note">${accessibleDescription}</desc>
    <defs>
      <linearGradient id="ink" x2="1" y2=".12" gradientUnits="objectBoundingBox"><stop stop-color="#132441"/><stop offset=".47" stop-color="#081127"/><stop offset=".57" stop-color="#050b21"/><stop offset="1" stop-color="#050b21"/></linearGradient>
      <linearGradient id="feather"><stop stop-color="black"/><stop offset=".04" stop-color="white"/><stop offset=".97" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <linearGradient id="ends" x2="0" y2="1"><stop stop-color="black"/><stop offset=".04" stop-color="white"/><stop offset=".97" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <mask id="side"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="url(#feather)"/></mask>
      <mask id="end"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="url(#ends)"/></mask>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#ink)"/>
    <g mask="url(#side)"><image mask="url(#end)" x="${ax}" y="${ay}" width="${aw}" height="${ah}" xlink:href="data:image/jpeg;base64,${art}"/></g>
    <g font-family="${fonts}">
      ${quickPickerIcon(social?63:53,social?76:40,34)}
      ${label(social?111:101,social?103:66,21,social?"聊天工具栏  /  CHAT TOOLBAR":section,colors.mint,700,'letter-spacing="1"')}
      ${social ? [
        label(60,215,69,labels.zh[0],colors.cream,700),
        label(62,282,48,labels.en[0],colors.cream,650),
        label(65,380,31,labels.zh[2],colors.body,550),
        label(65,426,25,labels.en[2],colors.body),
        quickControls(65,500,"挥手 / Wave","管理 / Manage")
      ].join("") : [
        label(53,153,lang==="zh"?66:58,title,colors.cream,700),
        label(56,215,lang==="zh"?32:30,desc,colors.body,500),
        quickControls(56,258,query,manage)
      ].join("")}
    </g>
  </svg>`;
}

// 三步安装与浏览器权限说明共用插画、字号和卡片结构。
const guides = {
  zh: {
    product:"SeaTalk 表情助手", setup:["安装指南","三步装好表情助手","适用于电脑上的 SeaTalk 网页版。"],
    steps:[["安装 Tampermonkey","从官网安装扩展，","并确认扩展已启用。"],["开启运行权限","打开扩展详情，开启","「允许用户脚本」。"],["安装表情助手","在 Greasy Fork 安装，","然后刷新 SeaTalk。"]],
    ready:"打开聊天，点输入框旁戴围巾的海豹。",
    perm:["浏览器设置","允许用户脚本","在 Chrome 或 Edge 中，为 Tampermonkey 打开这项权限。"],
    manage:"打开扩展详情", enable:"开启运行权限", menu:"管理扩展程序", toggle:"允许用户脚本", on:"已开启",
    hints:["右键点击工具栏上的 Tampermonkey 图标，","选择「管理扩展程序」。","开启「允许用户脚本」，","然后刷新 SeaTalk。"],
    fallback:"找不到开关？在浏览器扩展管理页开启「开发者模式」。"
  },
  en: {
    product:"SeaTalk Sticker Helper", setup:["SETUP GUIDE","Install Sticker Helper","For SeaTalk Web on desktop."],
    steps:[["Get Tampermonkey","Install the extension","from its official site."],["Allow user scripts","Open extension settings.","Enable Allow User Scripts."],["Install Sticker Helper","Install from Greasy Fork,","then reload SeaTalk."]],
    ready:"Open a chat and click the seal with a scarf beside the message box.",
    perm:["BROWSER SETTINGS","Allow user scripts","Give Tampermonkey permission in Chrome or Edge."],
    manage:"Open extension settings", enable:"Turn on the permission", menu:"Manage extension", toggle:"Allow User Scripts", on:"On",
    hints:["Right-click the Tampermonkey toolbar icon.","Choose Manage extension.","Enable Allow User Scripts,","then reload SeaTalk."],
    fallback:"No switch? Enable Developer mode on the browser’s extensions page."
  }
};

function badge(x,y,n,color) {
  return `<circle cx="${x+18}" cy="${y+18}" r="18" fill="${color}"/>
  ${label(x+18,y+26,22,n,colors.ink,700,'text-anchor="middle"')}`;
}

function guide(lang,permission,tiles) {
  const t=guides[lang], top=permission?t.perm:t.setup, palette=[colors.mint,colors.coral,colors.lilac];
  const block=(x,y,w,h,fill,stroke,rx=22)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
  const tile=(i,x,y,size)=>`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100"><g mask="url(#mx)"><image width="100" height="100" mask="url(#my)" xlink:href="data:image/jpeg;base64,${tiles[i]}"/></g></svg>`;
  const body=[];
  if(!permission) {
    t.steps.forEach(([title,line1,line2],i)=>{
      const x=60+448*i;
      body.push(block(x,218,424,421,colors.panel,colors.border),
        badge(x+24,241,String(i+1),palette[i]),tile(i,x+105,233,214),
        label(x+27,504,lang==="en"?31:34,title,colors.cream,700),
        label(x+28,558,27,line1,colors.body),label(x+28,597,27,line2,colors.body));
    });
  } else {
    [60,732].forEach((x,i)=>{
      body.push(block(x,218,648,421,colors.panel,colors.border),
        badge(x+25,249,String(i+1),palette[i]),label(x+80,279,lang==="en"?33:37,i?t.enable:t.manage,colors.cream,700),
        tile(i,x+525,226,95),block(x+28,326,592,169,"#13263b","#40566b",15));
      if(!i) {
        body.push(label(x+52,376,25,"Tampermonkey",colors.body,650),
          '<path d="M'+(x+50)+' 397h546" stroke="#40566b"/>',
          block(x+50,414,546,60,"#193b42","#45796f",10),
          label(x+72,453,28,t.menu,colors.cream,650),
          '<path d="m'+(x+554)+' 435 9 9-9 9" fill="none" stroke="'+colors.mint+'" stroke-width="3"/>');
      } else {
        body.push(label(x+52,374,24,"Tampermonkey",colors.body,650),
          '<path d="M'+(x+50)+' 397h546" stroke="#40566b"/>',
          label(x+52,454,30,t.toggle,colors.cream,650),
          label(x+484,452,23,t.on,colors.mint,650,'text-anchor="end"'),
          block(x+501,419,87,48,"#287767",colors.mint,24),
          '<circle cx="'+(x+561)+'" cy="443" r="17" fill="#effff4"/>');
      }
      body.push(label(x+27,551,25,t.hints[2*i],colors.body),label(x+27,591,25,t.hints[2*i+1],colors.body));
    });
  }
  const [w,h]=permission?[1600,900]:[1672,941];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 1440 810">
    <defs>
      <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#152741"/><stop offset=".7" stop-color="${colors.ink}"/><stop offset="1" stop-color="#111d33"/></linearGradient>
      <linearGradient id="edge"><stop stop-color="black"/><stop offset=".035" stop-color="white"/><stop offset=".97" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <linearGradient id="end" x2="0" y2="1"><stop stop-color="black"/><stop offset=".035" stop-color="white"/><stop offset=".97" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <mask id="mx"><rect width="100" height="100" fill="url(#edge)"/></mask><mask id="my"><rect width="100" height="100" fill="url(#end)"/></mask>
    </defs>
    <rect width="1440" height="810" fill="url(#bg)"/><g font-family="${fonts}">
    ${label(60,61,23,top[0],colors.mint,700,'letter-spacing="1"')}
    ${label(1380,61,23,t.product,colors.muted,600,'text-anchor="end"')}
    ${label(56,140,67,top[1],colors.cream,700)}${label(61,186,29,top[2],colors.body)}
    ${body.join("")}
    ${block(60,672,1320,80,"#142d3b","#416d6e",18)}
    ${permission
      ? `<circle cx="104" cy="712" r="16" stroke="${colors.mint}" fill="none" stroke-width="2.6"/><path d="M104 710v10m0-19v2" stroke="${colors.mint}" stroke-width="3"/>`
      : quickPickerIcon(81,689,46)}
    ${label(141,723,30,permission?t.fallback:t.ready,colors.cream,600)}</g></svg>`);
}

async function main() {
  // 若未提供新插画，重用已发布 SVG 内的干净副本，不依赖本机私有目录。
  let art;
  if (process.argv[2]) {
    const input = fs.realpathSync(process.argv[2]);
    art = (await sharp(input).resize(1104,736,{fit:"contain",background:"#020717"})
      .jpeg({quality:89,mozjpeg:true}).toBuffer()).toString("base64");
  } else {
    const svg = fs.readFileSync(path.join(images,stem+"zh.svg"),"utf8");
    const match = svg.match(/xlink:href="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/);
    if (!match) throw Error("当前横幅没有内嵌插画；首次运行请传入插画文件。");
    art = match[1];
  }
  // 教程原画是一排三张等宽贴纸；分成三张后，两种语言可使用完全相同的插画。
  const sourceSheet = fs.readFileSync(path.join(__dirname,"sticker-guide-illustrations.jpg"));
  const {width,height} = await sharp(sourceSheet).metadata();
  if (width!==height*3) throw Error("请提供横向三等分的教程原画。");
  const tiles = await Promise.all([0,1,2].map(async i=>(await sharp(sourceSheet)
    .extract({left:i*height,top:0,width:height,height}).jpeg({quality:91}).toBuffer()).toString("base64")));
  // 所有导出先在内存中完成并检查，再写入固定的九个文件。
  const outputs = new Map();
  for (const lang of ["zh","en"]) {
    const svg = Buffer.from(drawing(art,lang));
    outputs.set(stem+lang+".svg",svg);
    outputs.set(stem+lang+".png",await sharp(svg).png().toBuffer());
    outputs.set("install-sticker-helper."+lang+".png",await sharp(guide(lang,false,tiles)).png().toBuffer());
    outputs.set("allow-user-scripts.dark."+lang+".png",await sharp(guide(lang,true,tiles)).png().toBuffer());
  }
  const cover = await sharp(Buffer.from(drawing(art,"zh",true))).png().toBuffer();
  if (cover.length >= 1000000) throw Error("分享封面超过上传大小限制。");
  outputs.set(coverName,cover);
  for (const [name,bytes] of outputs) {
    const target = path.join(images,name);
    if (path.dirname(target)!==images || (fs.existsSync(target) && !fs.lstatSync(target).isFile())) throw Error("输出路径异常。");
    fs.writeFileSync(target,bytes);
    console.log(name,bytes.length);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
