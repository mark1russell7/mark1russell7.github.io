import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <main>
      <h1>Mark Russell</h1>
      <p>Portfolio under construction.</p>
      <h2>Projects</h2>
      <ul>
        <li>
          <a href="https://mark1russell7.github.io/vex/">Vex</a>: typed spreadsheet formulas over TypeScript objects. The site has a live demo, a Lab and a
          tested specification.
        </li>
        <li>
          <a href="https://mark1russell7.github.io/AsyncBrowserContext/">async-browser-context</a>: <code>AsyncLocalStorage</code> and the TC39{" "}
          <code>AsyncContext</code> API for browsers. The site has a live context debugger, a playground and the test results.
        </li>
      </ul>
    </main>
  );
}
