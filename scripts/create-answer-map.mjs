// 出題用の図から、同じ位置に答えを入れた解答用の図を生成する。
const escapeXml = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attribute = (text, name) => Number(text.match(new RegExp(`\\b${name}="([\\d.]+)"`))?.[1]);
export function createAnswerMap(svg, answer) {
  const rows = answer.trim().split(/\r?\n/).map((line) => {
    const match = line.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s+(.+)$/u);
    if (!match) throw new Error('地図の回答は番号と答えを１行ずつ記載してください。');
    return { number: match[1], name: match[2] };
  });
  const boxes = [...svg.matchAll(/<rect\b([^>]+)\/>/g)].map((match) => ({
    x: attribute(match[1], 'x'), y: attribute(match[1], 'y'),
    width: attribute(match[1], 'width'), height: attribute(match[1], 'height'),
  })).filter((box) => Object.values(box).every(Number.isFinite));
  let result = svg;
  for (const { number, name } of rows) {
    const labels = [...result.matchAll(new RegExp(`<text\\b([^>]+)>${number}</text>`, 'g'))];
    if (labels.length !== 1) throw new Error(`地図の${number}の位置を一意に特定できません。`);
    const [label] = labels;
    const x = attribute(label[1], 'x');
    const y = attribute(label[1], 'y');
    const box = boxes.filter((box) => x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!box) throw new Error(`地図の${number}の空欄を特定できません。`);
    const lines = name.endsWith('カリフ領')
      ? [`${number} ${name.slice(0, -4)}`, 'カリフ領'] : [`${number} ${name}`];
    const widthUnits = (line) => [...line].reduce((sum, char) => sum + (/^[\x20-\x7e]$/.test(char) ? 0.65 : 1), 0);
    const fontSize = Math.floor(Math.min(28, (box.width - 14) / Math.max(...lines.map(widthUnits)), (box.height - 7) / (lines.length * 1.1)));
    const lineHeight = fontSize * 1.1;
    const firstBaseline = box.y + box.height / 2 - (lines.length - 1) * lineHeight / 2 + fontSize * 0.35;
    const italic = label[1].includes('font-style="italic"') ? ' font-style="italic"' : '';
    const content = lines.map((line, i) => `<tspan x="${box.x + box.width / 2}" y="${firstBaseline + i * lineHeight}">${escapeXml(line)}</tspan>`).join('');
    result = result.replace(label[0], `<text text-anchor="middle" font-size="${fontSize}" fill="#145c42"${italic}>${content}</text>`);
  }
  if (/<text\b[^>]*>[①②③④⑤⑥⑦⑧⑨⑩]<\/text>/.test(result)) throw new Error('答えがない空欄が残っています。');
  result = result.replace(/(<title\b[^>]*>)[\s\S]*?<\/title>/, '$1地図の解答</title>')
    .replace(/(<desc\b[^>]*>)[\s\S]*?<\/desc>/, (_, opening) => `${opening}${escapeXml(answer.replaceAll('\n', '。'))}</desc>`);
  return result;
}
