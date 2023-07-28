import { readFile, writeFile, mkdtemp, access, constants } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';
import util from 'node:util';
import { exec as execNoPromise } from 'node:child_process';
import { chdir, cwd } from 'node:process';
import axios from 'axios';
import simpleGit from 'simple-git';
import { libyear } from 'francois-libyear';
import preferredPM from 'preferred-pm';
import semver from 'semver';
import { parseFile, parseRepositoryLine, replaceRepositoryWithSafeChar } from './utils.mjs';

export { parseFile, parseRepositoryLine, replaceRepositoryWithSafeChar };

const { satisfies } = semver;

const exec = util.promisify(execNoPromise);

const installCommand = {
  npm: 'npm install --ignore-scripts',
  yarn: 'yarn install --ignore-scripts',
  berry: 'yarn config set enableScripts false && yarn install',
  pnpm: 'pnpm install --ignore-scripts'
};

export async function main() {
  const filePath = new URL('../repositories.txt', import.meta.url);
  const content = await readFile(filePath, { encoding: 'utf8' });
  const lines = parseFile(content);
  const clonedRepositoriesPath = await cloneRepositories(lines);
  const installResult = await Promise.all(lines.map(async ({ repository, path }) => {
    const repositoryPath = clonedRepositoriesPath[repository];
    const packagePath = `${repositoryPath}${sep}${path}`;
    const packageManager = await getPreferredPm(packagePath);
    await installDependencies(packagePath, packageManager);
    return {
      repository,
      path,
      packagePath,
      packageManager,
    };
  }));
  for await (const { repository, path, packagePath, packageManager } of installResult) {
    const result = await calculateRepository(packagePath, packageManager);
    const summary = createSummary(result);
    const mergedBumpPullRequests = await getMergedBumpPullRequestsForYesterday(repository, path);
    await saveResult(`${repository}#${path}`, summary, result, mergedBumpPullRequests);
  }
}

async function cloneRepositories(lines) {
  const clonedRepositoriesPath = {};
  for await (const { repository } of lines) {
    if (!clonedRepositoriesPath[repository]) {
      const repositoryPath = await cloneRepository(repository, simpleGit(), process.env);
      clonedRepositoriesPath[repository] = repositoryPath;
    }
  }
  return clonedRepositoriesPath;
}

export async function getPreferredPm(packagePath) {
  const pm = (await preferredPM(packagePath)).name;
  if (pm === 'yarn') {
    const { stdout } = await exec('yarn --version', { cwd: packagePath });
    return satisfies(stdout, "^0 || ^1") ? "yarn" : "berry";
  }
  return pm;
}

export function replaceRepositoryVariablesWithEnvVariables(repository, variables) {
  return Object.keys(variables).reduce((memo, key) => {
    return memo.replaceAll(`$${key}`, variables[key]);
  }, repository);
}

export async function cloneRepository(repository, simpleGit, env) {
  const tempRepositoryPath = await mkdtemp(`${tmpdir()}${sep}`);
  await simpleGit.clone(replaceRepositoryVariablesWithEnvVariables(repository, env), tempRepositoryPath, { '--depth': 1 })
  return tempRepositoryPath;
}

function installDependencies(packagePath, packageManager) {
  return exec(installCommand[packageManager], { cwd: packagePath });
}

async function calculateRepository(packagePath, packageManager) {
  const previousDir = cwd();
  chdir(packagePath);
  const result = await libyear(packageManager, { all: true });
  chdir(previousDir);
  return result;
}

async function saveResult(line, summary, result, mergedBumpPullRequests) {
  await saveSummary(line, summary, mergedBumpPullRequests);
  await saveLastResult(line, result);
}

async function saveSummary(line, summary, mergedBumpPullRequests) {
  const filePath = `data/history-${replaceRepositoryWithSafeChar(line)}.json`;
  try {
    await access(filePath, constants.F_OK);
  } catch (e) {
    await writeFile(filePath, JSON.stringify([]));
  }
  const content = JSON.parse(await readFile(filePath, {encoding: 'utf8'}));
  const yesterdaySummary = content.find((summary) => {
    return new Date(summary.date).toISOString().split('T')[0] === getYesterday().toISOString().split('T')[0];
  })
  if (yesterdaySummary) {
    yesterdaySummary.mergedBumpPullRequests = mergedBumpPullRequests;
  }
  content.push(summary);
  await writeFile(filePath, JSON.stringify(content));
}

async function saveLastResult(line, result) {
  const filePath = `data/last-run-${replaceRepositoryWithSafeChar(line)}.json`;
  await writeFile(filePath, JSON.stringify(result));
}

export function createSummary(result) {
  return result.reduce((memo, dep) => {
    memo.drift += dep.drift || 0;
    memo.pulse += dep.pulse || 0;
    return memo;
  }, { drift: 0, pulse: 0, date: new Date() });
}

async function getMergedBumpPullRequestsForYesterday(repository, path, githubToken = process.env.GITHUB_TOKEN) {
  const result = await axios({
    url: 'https://api.github.com/graphql',
    method: 'post',
    headers: {
      Authorization: `bearer ${githubToken}`,
      "content-type": "application/json",
    },
    data: {
      query: getQueryForMergedBumpPullRequestsForYesterday(repository, path),
    }
  });

  return result.data.data.search.nodes.length;
}


export function getQueryForMergedBumpPullRequestsForYesterday(repository, path) {
  const yesterday = getYesterday().toISOString().split('T')[0];
  const pathToSearch = path !== '' ? `(${path})` : '';
  return `
    query {
      search(first: 100, query: "repo:${repository} is:pr is:merged merged:${yesterday}..${yesterday} in:title [BUMP] ${pathToSearch}", type: ISSUE) {
        nodes {
          ... on PullRequest {
            title
          }
        }
      }
    }`;
}

function getYesterday() {
  return new Date(new Date().setDate(new Date().getDate() - 1));
}