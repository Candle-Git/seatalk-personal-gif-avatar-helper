// 只用于排版公开宣传图，不会被打包进油猴脚本，也不读取聊天或账号数据。
// 需要 Node.js 和 sharp。直接运行本文件可重建图片；也可传入一张新的无文字插画。
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const images = fs.realpathSync(path.join(__dirname, "..", "docs", "images"));
const stem = "seatalk-sticker-helper-banner.";
const coverName = "seatalk-sticker-helper-social.png";
const fonts = "'Segoe UI','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

// 文字与插画分开保存：中英文共用一张插画，翻译或发新版时不必重新画。
const labels = {
  zh: ["SeaTalk 表情助手", "我的表情", "用备注找到表情，确认后再发送。", "挥手", "搜索收藏"],
  en: ["SeaTalk Sticker Helper", "MY STICKERS", "Find a sticker by its notes. Preview it before sending.", "Wave", "Search favorites"],
};

function xml(s) { return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function label(x, y, size, value, color, weight = 400, extra = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${xml(value)}</text>`;
}

// 放大镜和标签是静态示意：不需要账号、网络或外部字体文件。
function search(x, y, width, query, hint) {
  return `<g transform="translate(${x} ${y})">
    <rect width="${width}" height="48" rx="14" fill="#09192c" stroke="#295267"/>
    <g fill="none" stroke="#54eddf" stroke-width="2.4" stroke-linecap="round"><circle cx="25" cy="22" r="6.8"/><path d="m30 27 5 5"/></g>
    ${label(47,31,20,query,"#f1f7ff",600)}
    ${label(width-18,30,15,hint,"#9bafc6",500,'text-anchor="end"')}
  </g>`;
}

function drawing(art, lang, social = false) {
  const [title, section, desc, query, hint] = labels[lang];
  const [w,h] = social ? [1280,640] : [1200,360];
  const [ax,ay,aw] = social ? [563,61,812] : [630,-26,590];
  const ah = aw*2/3;
  const accessibleTitle = social ? "SeaTalk 表情助手 / SeaTalk Sticker Helper" : title;
  // 插画直接嵌入 SVG，GitHub 作为图片显示它时不必再请求其他图片。
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title note">
    <title id="title">${accessibleTitle}</title><desc id="note">${social ? "整理、搜索和分享收藏表情。 Organize, find and share favorite stickers." : desc}</desc>
    <defs>
      <linearGradient id="ink" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#090f2a"/><stop offset=".52" stop-color="#050b1d"/><stop offset="1" stop-color="#020717"/></linearGradient>
      <linearGradient id="feather"><stop stop-color="black"/><stop offset=".16" stop-color="white"/><stop offset=".87" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <linearGradient id="ends" x2="0" y2="1"><stop stop-color="black"/><stop offset=".12" stop-color="white"/><stop offset=".91" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <mask id="side"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="url(#feather)"/></mask>
      <mask id="end"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="url(#ends)"/></mask>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#ink)"/>
    <g mask="url(#side)"><image mask="url(#end)" x="${ax}" y="${ay}" width="${aw}" height="${ah}" xlink:href="data:image/jpeg;base64,${art}"/></g>
    <g font-family="${fonts}">
      <g transform="translate(${social?76:58} ${social?104:46})" stroke="#4ce5d5" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10l4 4h8v12H3z"/><path d="M7 0h9l4 4"/></g>
      ${label(social?118:100,social?123:65,social?23:17,social?"STICKER LIBRARY":section,"#59e8d7",700,'letter-spacing="2"')}
      ${social ? [
        label(70,248,70,labels.zh[0],"#f6f8ff",700),
        label(73,314,45,labels.en[0],"#e1eaff",600),
        label(76,404,27,"整理、搜索、分享你的收藏表情。","#b8c7de"),
        label(77,444,23,"Organize, find and share your favorites.","#b8c7de"),
        search(76,500,334,"挥手  /  Wave","搜索")
      ].join("") : [
        label(54,154,lang==="zh"?63:58,title,"#f6f8ff",700),
        label(58,205,lang==="zh"?25:23,desc,"#bccbe2"),
        search(58,251,lang==="zh"?300:320,query,hint)
      ].join("")}
    </g>
  </svg>`;
}

// 安装图和授权图共用以下翻译、画布和图标。左中右三张贴纸依次对应扩展、授权、安装完成。
const guides = {
  zh: {
    product:"SeaTalk 表情助手", setup:["首次安装","三步装好表情助手","准备好浏览器扩展后，就可以打开自己的收藏。"],
    steps:[["安装 Tampermonkey","从官网安装浏览器扩展，","并确认扩展已启用。"],["允许用户脚本","打开扩展详情，开启","「允许用户脚本」。"],["安装表情助手","在 Greasy Fork 点击","「安装此脚本」，再刷新 SeaTalk。"]],
    ready:"打开爱心「收藏」页签，再进入助手的「我的表情」。",
    perm:["浏览器授权","允许用户脚本","Chrome 或 Edge · 只需设置一次。下图为操作示意。"],
    manage:"打开扩展设置", enable:"开启运行权限", menu:"管理扩展程序", toggle:"允许用户脚本", on:"已开启",
    hints:["右键点击工具栏上的 Tampermonkey 图标，","选择「管理扩展程序」。","在 Tampermonkey 的详情页找到此开关，","开启后，刷新 SeaTalk 网页版。"],
    fallback:"没有这个开关？可在浏览器的扩展管理页开启「开发者模式」。"
  },
  en: {
    product:"SeaTalk Sticker Helper", setup:["FIRST-TIME SETUP","Set up in three steps","Start with the browser extension, then open your sticker collection."],
    steps:[["Install Tampermonkey","Get the browser extension from","its official site and enable it."],["Allow user scripts","Open the extension settings and","turn on “Allow User Scripts”."],["Install Sticker Helper","Select “Install this script” on","Greasy Fork, then reload SeaTalk."]],
    ready:"Open the heart-shaped Favorites tab in SeaTalk, then open My stickers.",
    perm:["BROWSER PERMISSIONS","Allow user scripts","Chrome or Edge · One-time setup. The controls below are illustrations."],
    manage:"Open extension settings", enable:"Turn on the permission", menu:"Manage extension", toggle:"Allow User Scripts", on:"On",
    hints:["Right-click the Tampermonkey icon in the","browser toolbar and choose “Manage extension”.","Find this switch in the Tampermonkey details","page. Turn it on, then reload SeaTalk Web."],
    fallback:"No switch? Enable Developer mode on the browser’s extensions page instead."
  }
};

// 小图只取自专门绘制的贴纸，不会引用浏览器截图或本机个人资料。
function badge(x,y,n,color) {
  return `<rect x="${x}" y="${y}" width="53" height="32" rx="12" fill="#101e34" stroke="${color}"/>
  ${label(x+26.5,y+23,19,n,color,700,'text-anchor="middle"')}`;
}
function guide(lang,permission,tiles) {
  const t=guides[lang], top=permission?t.perm:t.setup, palette=["#67efe1","#b7a1ff","#70d8ff"];
  const block=(x,y,w,h,fill,stroke,rx=22)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
  // 淡化小插画的四条边，让卡片与深蓝背景衔接。
  const tile=(i,x,y,size)=>`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100"><g mask="url(#mx)"><image width="100" height="100" mask="url(#my)" xlink:href="data:image/jpeg;base64,${tiles[i]}"/></g></svg>`;
  const body=[];
  if(!permission) {
    t.steps.forEach(([title,line1,line2],i)=>{
      const x=60+448*i;
      body.push(block(x,222,424,411,"#060e20","#26394e"),
        badge(x+25,247,"0"+(i+1),palette[i]),tile(i,x+113,259,198),
        label(x+29,512,lang==="en"?28:32,title,"#f1f5ff",700),
        label(x+29,565,23,line1,"#bdcbe0"),label(x+29,600,23,line2,"#bdcbe0"));
    });
  } else {
    [60,732].forEach((x,i)=>{
      body.push(block(x,222,648,411,"#060e20","#26394e"),
        badge(x+26,250,"0"+(i+1),palette[i]),label(x+98,279,lang==="en"?32:35,i?t.enable:t.manage,"#f1f5ff",700),
        tile(i,x+527,231,90),block(x+29,330,590,164,"#0b192e","#30465c",13));
      if(!i) {
        // 左卡：工具栏图标和菜单选项。两个标注连在一起，说明点击顺序。
        body.push(label(x+53,377,24,"Tampermonkey","#e5edfb",650),
          '<path d="M'+(x+52)+' 397h542" stroke="#30465c"/>',
          block(x+51,415,542,59,"#122b3b","#356074",9),
          label(x+75,454,26,t.menu,"#f1f5ff",600),
          '<path d="m'+(x+550)+' 436 8 8-8 8" fill="none" stroke="#73eee2" stroke-width="3"/>');
      } else {
        body.push(label(x+52,373,20,"Tampermonkey","#a7b7ce"),
          '<path d="M'+(x+52)+' 397h542" stroke="#30465c"/>',
          label(x+52,453,27,t.toggle,"#f1f5ff",650),
          label(x+481,450,19,t.on,"#6bf1dd",650,'text-anchor="end"'),
          block(x+496,420,87,45,"#158478","#58e7d9",24),
          '<circle cx="'+(x+560)+'" cy="442.5" r="15" fill="#f0fffe"/>');
      }
      body.push(label(x+29,550,23,t.hints[2*i],"#bdcbe0"),label(x+29,585,23,t.hints[2*i+1],"#bdcbe0"));
    });
  }
  const [w,h]=permission?[1600,900]:[1672,941];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 1440 810">
    <defs>
      <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0b122e"/><stop offset="1" stop-color="#020715"/></linearGradient>
      <linearGradient id="edge"><stop stop-color="black"/><stop offset=".14" stop-color="white"/><stop offset=".86" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <linearGradient id="end" x2="0" y2="1"><stop stop-color="black"/><stop offset=".10" stop-color="white"/><stop offset=".93" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
      <mask id="mx"><rect width="100" height="100" fill="url(#edge)"/></mask><mask id="my"><rect width="100" height="100" fill="url(#end)"/></mask>
    </defs>
    <rect width="1440" height="810" fill="url(#bg)"/><g font-family="${fonts}">
    ${label(60,64,19,top[0],"#66edda",700,'letter-spacing="2"')}
    ${label(1380,64,20,t.product,"#9eb4cc",600,'text-anchor="end"')}
    ${label(55,145,61,top[1],"#f3f6ff",700)}${label(61,191,26,top[2],"#bdcbe0")}
    ${body.join("")}
    ${block(60,671,1320,77,"#0a2030","#2c5867",17)}
    <circle cx="103" cy="709" r="15" stroke="#5de9d4" fill="none" stroke-width="2.4"/>
    ${permission?'<path d="M103 708v9m0-16v2" stroke="#61ebd8" stroke-width="2.7"/>':'<path d="m96 709 5 5 9-11" fill="none" stroke="#61ebd8" stroke-width="2.7"/>'}
    ${label(139,719,25,permission?t.fallback:t.ready,"#d7f4f1",600)}</g></svg>`);
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
