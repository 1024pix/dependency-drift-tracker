import { readFile, writeFile, mkdtemp, access, constants } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';
import util from 'node:util';
import { exec as execNoPromise } from 'node:child_process';
import { chdir, cwd } from 'node:process';
import simpleGit from 'simple-git';
import { libyear } from 'francois-libyear';
import preferredPM from 'preferred-pm';
import semver from 'semver';

const { satisfies } = semver;

const exec = util.promisify(execNoPromise);

async function main() {
  const filePath = new URL('../repositories.txt', import.meta.url);
  const content = await readFile(filePath, { encoding: 'utf8' });
  const lines = parseFile(content);
  const clonedRepositoriesPath = await cloneRepositories(lines);
  const installResult = await Promise.all(lines.map(async ({ repository, path }) => {
    const repositoryPath = clonedRepositoriesPath[repository];
    const packagePath = `${repositoryPath}${sep}${path}`;
    const { pm, forLibYear } = await getPreferredPm(packagePath);
    await installDependencies(packagePath, pm);
    return {
      repository,
      path,
      packagePath,
      pmForLibYear: forLibYear,
    };
  }));
  const historyIndex = [];
  const lastRunIndex = [];
  for await (const { repository, path, packagePath, pmForLibYear } of installResult) {
    const result = await calculateRepository(packagePath, pmForLibYear);
    const summary = createSummary(result);
    const safeRepositoryName = getSafeRepositoryName(repository, path);
    const [historyFileName, lastRunFileName] = await saveResult(safeRepositoryName, summary, result);
    historyIndex.push({ repository: safeRepositoryName, fileName: historyFileName });
    lastRunIndex.push({ repository: safeRepositoryName, fileName: lastRunFileName });
  }
  await saveIndex('history', historyIndex);
  await saveIndex('last-run', lastRunIndex);
}

export function parseFile(content) {
  return content.split('\n').map((line) => {
    if (line.trim() === '' || line.trim().startsWith('#')) {
      return;
    }
    return parseRepositoryLine(line);
  }).filter(r => !!r);
}

async function cloneRepositories(lines) {
  const clonedRepositoriesPath = {};
  for await (const { repository } of lines) {
    if (!clonedRepositoriesPath[repository]) {
      const repositoryPath = await cloneRepository(repository, simpleGit());
      clonedRepositoriesPath[repository] = repositoryPath;
    }
  }
  return clonedRepositoriesPath;
}

export async function getPreferredPm(packagePath) {
  const pm = (await preferredPM(packagePath)).name;
  let forLibYear = pm;
  if (pm === 'yarn') {
    const { stdout } = await exec('yarn --version', { cwd: packagePath });
    forLibYear = satisfies(stdout, "^0 || ^1") ? "yarn" : "berry";
  }
  return {
    pm,
    forLibYear,
  };
}

export function parseRepositoryLine(line) {
  const [repository, path] = line.split('#');
  return {
    repository,
    path: path || '',
  };
}

export async function cloneRepository(repository, simpleGit) {
  const tempRepositoryPath = await mkdtemp(`${tmpdir()}${sep}`);
  await simpleGit.clone(repository, tempRepositoryPath, { '--depth': 1 })
  return tempRepositoryPath;
}

function installDependencies(packagePath, packageManager) {
  return exec(`${packageManager} install`, { cwd: packagePath });
}

async function calculateRepository(packagePath, packageManager) {
  const previousDir = cwd();
  chdir(packagePath);
  const result = await libyear(packageManager, { all: true });
  chdir(previousDir);
  return result;
}

export function getSafeRepositoryName(repositoryURL, path) {
  const repository = path === '' ? repositoryURL : `${repositoryURL}#${path}`;
  return replaceRepositoryWithSafeChar(repository);
}

async function saveResult(line, summary, result) {
  return Promise.all([
    saveSummary(line, summary),
    saveLastResult(line, result)
  ]);
}

async function saveSummary(line, summary) {
  const fileName = `history-${line}.json`;
  const filePath = `data/${fileName}`;
  try {
    await access(filePath, constants.F_OK);
  } catch (e) {
    await writeFile(filePath, JSON.stringify([]));
  }
  const content = JSON.parse(await readFile(filePath, { encoding: 'utf8' }));
  content.push(summary);
  await writeFile(filePath, JSON.stringify(content));
  return fileName;
}

async function saveLastResult(line, result) {
  const fileName = `last-run-${line}.json`;
  const filePath = `data/${fileName}`;
  await writeFile(filePath, JSON.stringify(result));
  return fileName;
}

async function saveIndex(name, index) {
  const filePath = `data/${name}-index.json`;
  await writeFile(filePath, JSON.stringify(index));
}

export function replaceRepositoryWithSafeChar(line) {
  return line.replaceAll(/(https?:\/\/)/g, '').replaceAll(/(-|\/|:|\.|#)/g, '-');
}

export function createSummary(result) {
  return result.reduce((memo, dep) => {
    memo.drift += dep.drift || 0;
    memo.pulse += dep.pulse || 0;
    return memo;
  }, { drift: 0, pulse: 0 });
}

if (process.env.NODE_ENV !== 'test') {
  main();
}
