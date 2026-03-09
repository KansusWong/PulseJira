import fs from 'fs';
import path from 'path';

export function getPackageJson() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = fs.readFileSync(pkgPath, 'utf-8');
    return JSON.parse(pkg);
  } catch (e) {
    return null;
  }
}

export function getFileTree(dir: string = process.cwd(), depth: number = 2): string[] {
  if (depth < 0) return [];
  const results: string[] = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (file.startsWith('.') || file === 'node_modules' || file === '.next') continue;
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results.push(file + "/");
        const sub = getFileTree(filePath, depth - 1);
        results.push(...sub.map(s => file + "/" + s));
      } else {
        results.push(file);
      }
    }
  } catch (e) {
    // ignore
  }
  return results;
}

export function getCodeContext() {
  const pkg = getPackageJson();
  const tree = getFileTree();
  
  return `
Project Context:
Dependencies: ${Object.keys(pkg?.dependencies || {}).join(', ')}
File Structure:
${tree.join('\n')}
`;
}
