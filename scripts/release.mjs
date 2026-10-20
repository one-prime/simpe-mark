// Builds and publishes the @simple-mark packages to npm.
//
// In the repo, each package exports its TypeScript source (the workspace, Vite and the tests
// use it directly). For release, each is built with tsdown into packages/<name>/dist, which
// gets a publish-ready package.json (exports to the built files, @simple-mark dependencies
// at this version), the package's README and the license, and is published from there.
//
//   npm run release -- --pack      build and pack .tgz files into dist/release (no publishing)
//   npm run release -- --dry-run   build and run `npm publish --dry-run`
//   npm run release                build and publish (npm asks for your 2FA confirmation)

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'tsdown';

/** In dependency order: a package is published after the packages it uses. */
const PACKAGES = ['model', 'math', 'canvas', 'codemirror'];
const root = new URL('..', import.meta.url).pathname;
const mode = process.argv.includes('--pack') ? 'pack' : process.argv.includes('--dry-run') ? 'dry-run' : 'publish';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const repository = { type: 'git', url: 'git+https://github.com/one-prime/simple-mark.git' };

/** Whether this exact version is on the npm registry. */
function isPublished(name, version) {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version;
  } catch {
    return false; // not found (404): not published
  }
}
const versions = Object.fromEntries(PACKAGES.map((name) => [`@simple-mark/${name}`, read(join(root, 'packages', name, 'package.json')).version]));

for (const name of PACKAGES) {
  const dir = join(root, 'packages', name);
  const pkg = read(join(dir, 'package.json'));
  const dist = join(dir, 'dist');
  const dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).map(([dep, range]) => [dep, dep in versions ? `^${versions[dep]}` : range]),
  );

  await build({
    entry: { index: join(dir, 'src/index.ts') },
    outDir: dist,
    format: 'esm',
    platform: 'neutral',
    dts: true,
    clean: true,
    // Everything the package depends on stays an import; only its own code is bundled.
    external: Object.keys(dependencies).map((dep) => new RegExp(`^${dep}(/|$)`)),
    logLevel: 'warn',
  });

  // Side-effect imports (`import "x";`) carry no types; in a .d.ts they only drag the
  // imported library's own types into the user's type check (MathJax's fail strict checks).
  const types = join(dist, 'index.d.ts');
  writeFileSync(types, readFileSync(types, 'utf8').replace(/^import "[^"]+";\n/gm, ''));

  writeFileSync(
    join(dist, 'package.json'),
    `${JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        license: 'MIT',
        type: 'module',
        repository: { ...repository, directory: `packages/${name}` },
        keywords: ['markdown', 'wysiwyg', 'editor', 'gfm', ...(pkg.keywords ?? [])],
        exports: { '.': { types: './index.d.ts', import: './index.js' } },
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  copyFileSync(join(dir, 'README.md'), join(dist, 'README.md'));
  copyFileSync(join(root, 'LICENSE'), join(dist, 'LICENSE'));

  // A rerun after a partial release publishes only what is missing (versions can't be reused).
  const published = mode === 'publish' && isPublished(pkg.name, pkg.version);
  if (published) {
    console.log(`${pkg.name}@${pkg.version} is already on npm; skipped`);
  } else if (mode === 'pack') {
    const out = join(root, 'dist/release');
    mkdirSync(out, { recursive: true });
    execFileSync('npm', ['pack', dist, '--pack-destination', out], { stdio: 'inherit' });
  } else {
    execFileSync('npm', ['publish', dist, '--access', 'public', ...(mode === 'dry-run' ? ['--dry-run'] : [])], { stdio: 'inherit' });
  }
}
