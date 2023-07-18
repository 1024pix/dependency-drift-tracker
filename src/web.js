import Chart from 'chart.js/auto';
import { parseFile, replaceRepositoryWithSafeChar } from './utils.mjs';

const PATH = process.env.REPOSITORY_URL || `https://raw.githubusercontent.com/1024pix/dependency-drift-tracker/main/`;
let driftChart;
let pulseChart;

async function getRepositories() {
  const response = await fetch(`${PATH}/repositories.txt`);
  return response.text();
}

function displayNav(repositories) {
  const nav = document.getElementById("nav");
  repositories.forEach(({ repository, path }) => {
    const li = document.createElement("li");
    li.classList.add('nav-item');
    const link = document.createElement("a");
    link.classList.add('nav-link');
    const line = createLine({ repository, path });
    link.innerText = beautifyLine(line);
    link.setAttribute('href', '#')
    link.dataset.line = createLine({ repository, path });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      displayChart({ repository, path });
      selectButton({ repository, path });
    })
    li.appendChild(link);
    nav.appendChild(li);
  });
}

function createLine({ repository, path }) {
  return `${repository}#${path}`;
}

function beautifyLine(line) {
  return line.replaceAll('https://github.com/', '').replaceAll('.git', '');
}

async function displayChart({ repository, path }) {
  const line = createLine({ repository, path });
  const response = await fetch(`${PATH}/data/history-${replaceRepositoryWithSafeChar(line)}.json`);
  const data = await response.json();
  const labels = data.map((d, i) => i);

  const driftCtx = document.getElementById("driftChart");
  const pulseCtx = document.getElementById("pulseChart");
  if (driftChart) driftChart.destroy();
  if (pulseChart) pulseChart.destroy();

  driftChart = new Chart(driftCtx, {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Dependency Drift',
          data: data.map(d => d.drift),
          backgroundColor: 'rgba(0, 63, 92, 0.2)',
          borderColor: 'rgba(0, 63, 92, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: ({label, formattedValue}) => `${label} : ${formattedValue} libyears`
          }
        }
      },
      scales: {
        y: {
          position: "left",
          beginAtZero: true,
          suggestedMin: 0,
        },
      },
    },
  });


  pulseChart = new Chart(pulseCtx, {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Dependency Pulse',
          data: data.map(d => d.pulse),
          backgroundColor: 'rgba(155, 209, 132, 0.2)',
          borderColor: 'rgba(155, 209, 132, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: ({label, formattedValue}) => `${label} : ${formattedValue} libyears`
          }
        }
      },
      scales: {
        y: {
          position: "left",
        },
      },
    },
  })
}

function selectButton({ repository, path }) {
  const links = document.querySelectorAll("[data-line]");
  links.forEach(link => {
    link.classList.remove("active");
  });
  const line = createLine({ repository, path });
  const link = document.querySelector(`[data-line="${line}"]`);
  link.classList.add("active");
}

async function main() {
  const repositories = parseFile(await getRepositories());
  displayNav(repositories);
  await displayChart(repositories[0]);
  await selectButton(repositories[0]);
}

main();
