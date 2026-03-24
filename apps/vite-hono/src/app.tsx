import { useState } from 'react'

export function App() {
  return (
    <>
      <h1>Vite + React + Hono</h1>
      <h2>Example of useState()</h2>
      <Counter />
      <h2>Example of API fetch()</h2>
      <ClockButton />
    </>
  )
}

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)} type="button">
      You clicked me {count} times
    </button>
  )
}

function ClockButton() {
  const [response, setResponse] = useState<string | null>(null)

  const handleClick = async () => {
    const response = await fetch('/api/clock')
    const data = await response.json()
    const headers = Array.from(response.headers.entries()).reduce<
      Record<string, string>
    >((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {})
    const fullResponse = {
      url: response.url,
      status: response.status,
      headers,
      body: data,
    }

    setResponse(JSON.stringify(fullResponse, null, 2))
  }

  return (
    <div>
      <button onClick={handleClick} type="button">
        Get Server Time
      </button>
      {response && <pre>{response}</pre>}
    </div>
  )
}
