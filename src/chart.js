import Chart from 'chart.js/auto';
import { formatFloat } from './utils.mjs';

export function createDriftChart(ctx, data) {
  const baseColor = [0, 63, 92];
  return new Chart(ctx, {
    data: {
      labels: data.map((d, i) => new Date(d.date).toLocaleDateString()),
      datasets: [
        {
          type: 'line',
          label: 'Dependency Drift',
          data: data.map(d => formatFloat(d.drift)),
          backgroundColor: `rgba(${baseColor.join()}, 0.2)`,
          borderColor: `rgba(${baseColor.join()}, 1)`,
          borderWidth: 1,
          yAxisID: 'y',
          unit: 'libyears',
        },
        {
          type: 'bar',
          label: 'Merged Bump Pull Requests',
          data: data.map(d => d.mergedBumpPullRequests),
          yAxisID: 'y2',
          unit: 'PR'
        }
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: tooltipLabel,
          }
        }
      },
      scales: {
        y: {
          position: "left",
          beginAtZero: true,
          suggestedMin: 0,
        },
        y2: {
          position: "right",
          beginAtZero: true,
          suggestedMin: 0,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            stepSize: 1,
          },
        }
      },
    },
  });
}

export function createPulseChart(ctx, data) {
  const baseColor = [155, 209, 132];
  return new Chart(ctx, {
    data: {
      labels: data.map((d, i) => new Date(d.date).toLocaleDateString()),
      datasets: [
        {
          type: 'line',
          label: 'Dependency Pulse',
          data: data.map(d => formatFloat(d.pulse)),
          backgroundColor: `rgba(${baseColor.join()}, 0.2)`,
          borderColor: `rgba(${baseColor.join()}, 1)`,
          borderWidth: 1,
          unit: 'libyears',
        },
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: tooltipLabel,
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
}

function tooltipLabel(context) {
  const dataset = context.dataset;
  const index = context.dataIndex;
  const value = dataset.data[index];
  const label = dataset.label || "";
  const unit = dataset.unit || "";

  return `${label}: ${value} (${unit})`;
}