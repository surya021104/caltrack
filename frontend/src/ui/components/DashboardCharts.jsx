import React from "react"
import { Bar, Line, Doughnut } from "react-chartjs-2"
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from "chart.js"

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

export function BarChart({ data, options }) {
  return <Bar data={data} options={options} />
}

export function LineChart({ data, options }) {
  return <Line data={data} options={options} />
}

export function DoughnutChart({ data, options }) {
  return <Doughnut data={data} options={options} />
}
