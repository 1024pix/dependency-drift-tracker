import {expect} from 'chai';
import sinon from 'sinon';
import {
  cloneRepository,
  createSummary,
  getQueryForMergedBumpPullRequestsForYesterday,
  parseFile,
  parseRepositoryLine,
  replaceRepositoryVariablesWithEnvVariables,
  replaceRepositoryWithSafeChar
} from '../src/index.mjs';

describe('#parseRepositoryLine', function () {
  it('parse simple repository', function () {
    expect(parseRepositoryLine('https://github.com/1024pix/pix.git')).to.deep.equal({
      repository: 'https://github.com/1024pix/pix.git',
      path: ''
    })
  });

  it('parse repository with a sub directory', function () {
    expect(parseRepositoryLine('https://github.com/1024pix/pix.git#test')).to.deep.equal({
      repository: 'https://github.com/1024pix/pix.git',
      path: 'test'
    })
  });
});

describe('#parseFile', function () {
  it('parse the file', function () {
    const content = `
https://github.com/1024pix/pix.git#api
https://github.com/1024pix/pix.git#mon-pix
# comment line
`;
    expect(parseFile(content)).to.deep.equal([
      {
        repository: 'https://github.com/1024pix/pix.git',
        path: 'api',
      },
      {
        repository: 'https://github.com/1024pix/pix.git',
        path: 'mon-pix'
      },
    ])
  });
});

describe('#cloneRepository', function () {
  it('create a temporary directory and clone the repository there', async function () {
    const simpleGit = {
      clone: sinon.stub().resolves(null)
    };
    const repositoryPath = await cloneRepository('https://github.com/1024pix/pix.git', simpleGit, {});
    expect(simpleGit.clone.calledWith('https://github.com/1024pix/pix.git')).to.be.true;
    expect(repositoryPath).to.be.a('string');
  });

  it('create a temporary directory and clone the repository there with variable substition', async function () {
    const simpleGit = {
      clone: sinon.stub().resolves(null)
    };
    const repositoryPath = await cloneRepository('https://$FOO@github.com/1024pix/pix.git', simpleGit, {FOO: 'BAR'});
    expect(simpleGit.clone.calledWith('https://BAR@github.com/1024pix/pix.git')).to.be.true;
    expect(repositoryPath).to.be.a('string');
  });
});

describe('#replaceRepositoryVariablesWithEnvVariables', function () {
  [
    {
      repository: 'https://$FOO@github.com/1024pix/pix.git',
      variables: {},
      expected: 'https://$FOO@github.com/1024pix/pix.git',
    },
    {
      repository: 'https://$FOO@github.com/1024pix/pix.git',
      variables: {FOO: 'BAR'},
      expected: 'https://BAR@github.com/1024pix/pix.git',
    },
    {
      repository: 'https://$FOO:$FOO@github.com/1024pix/pix.git',
      variables: {FOO: 'BAR'},
      expected: 'https://BAR:BAR@github.com/1024pix/pix.git',
    },
    {
      repository: 'https://$FOO:$BAR@github.com/1024pix/pix.git',
      variables: {FOO: 'BAR', BAR: 'FOO'},
      expected: 'https://BAR:FOO@github.com/1024pix/pix.git',
    },
  ].forEach(({repository, variables, expected}) => {
    it(`replace var in the ${repository} string by env var`, function () {
      const result = replaceRepositoryVariablesWithEnvVariables(repository, variables);
      expect(result).to.equal(expected);
    });
  });
});

describe('#replaceRepositoryWithSafeChar', function () {
  [
    {
      given: 'https://github.com/1024pix/pix.git',
      expect: 'github-com-1024pix-pix-git'
    },
    {
      given: 'https://github.com/1024pix/pix.git#api',
      expect: 'github-com-1024pix-pix-git-api'
    },
    {
      given: 'http://github.com/1024pix/pix.git#api',
      expect: 'github-com-1024pix-pix-git-api'
    },
  ].forEach((line) => {
    it(`replace the repository line '${line.given}' with safe chars`, function () {
      expect(replaceRepositoryWithSafeChar(line.given)).to.equal(line.expect);
    });
  });
});

describe('#createSummary', function () {
  it('create a summary of the result', function () {
    const result = [
      {
        drift: 1,
        pulse: 2,
      },
      {
        drift: 3,
        pulse: 1,
      },
      {},
    ];
    const summary = createSummary(result)
    expect(summary).to.deep.include({
      drift: 4,
      pulse: 3,
    });
    expect(summary.date).to.exist;
  });
});

describe('#getQueryForMergedBumpPullRequestsForYesterday', function () {
  let clock;

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      now: new Date('2023-02-01T00:00:00Z'),
      toFake: ['Date']
    });
  });

  afterEach(function () {
    clock.restore();
  });

  it('create a query for merged pull requests for yesterday', function () {
    const query = getQueryForMergedBumpPullRequestsForYesterday('1024pix/pix', '1d');

    const expectedQuery = `
    query {
      search(first: 100, query: "repo:1024pix/pix is:pr is:merged merged:2023-01-31..2023-01-31 in:title [BUMP] (1d)", type: ISSUE) {
        nodes {
          ... on PullRequest {
            title
          }
        }
      }
    }`;
    expect(query).to.equal(expectedQuery);
  });

  context('when the path is not specified', function () {
    it('should remove pathSearch from the query', function () {
      const query = getQueryForMergedBumpPullRequestsForYesterday('1024pix/pix', '');


      const expectedQuery = `
    query {
      search(first: 100, query: "repo:1024pix/pix is:pr is:merged merged:2023-01-31..2023-01-31 in:title [BUMP] ", type: ISSUE) {
        nodes {
          ... on PullRequest {
            title
          }
        }
      }
    }`;
      expect(query).to.equal(expectedQuery);
    });
  });
});