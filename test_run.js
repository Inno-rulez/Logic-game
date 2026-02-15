const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
const jsPath = path.join(__dirname, 'game.js');
const cssPath = path.join(__dirname, 'style.css');
let html = fs.readFileSync(htmlPath, 'utf8');
const gameJs = fs.readFileSync(jsPath, 'utf8');
const styleCss = fs.readFileSync(cssPath, 'utf8');
// Inline CSS and game.js so JSDOM doesn't try to fetch external resources
html = html.replace(/<link[^>]+href="style\.css"[^>]*>/, `<style>\n${styleCss}\n</style>`);
html = html.replace(/<script[^>]+src="game\.js"[^>]*><\/script>/, '');
html = html.replace('</body>', `<script>${gameJs}\n</script></body>`);

const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
// mirror console
dom.window.console = console;

dom.window.addEventListener('load', () => {
  console.log('DOM loaded.');
  // Ensure conditions mode
  if (typeof dom.window.setMode === 'function') dom.window.setMode('conditions');
  // Simulate dropping a condition block into the program drop zone
  const dropZone = dom.window.document.getElementById('programDropZone');
  const evCond = {
    preventDefault: () => {},
    dataTransfer: { getData: (k) => (k === 'command' ? 'cond_obstacle' : '') },
    target: dropZone
  };
  const created = dom.window.handleDrop && dom.window.handleDrop(evCond);
  console.log('handleDrop returned:', created && created.type);

  // Find the newly created condition block element and drop a `forward` into its children
  const condEl = dom.window.document.querySelector('.condition-block');
  if (condEl) {
    const children = condEl.querySelector('.children-container');
    const evForward = {
      preventDefault: () => {},
      stopPropagation: () => {},
      dataTransfer: { getData: (k) => (k === 'command' ? 'forward' : '') },
      target: children
    };
    dom.window.handleDropEnhanced && dom.window.handleDropEnhanced(evForward);
    console.log('Dropped forward into condition children.');
  } else {
    console.log('No condition element found in DOM.');
  }

  // Run program
  dom.window.runProgram && dom.window.runProgram();

  // Wait for execution to complete (a few seconds) then dump output
  setTimeout(() => {
    const outEl = dom.window.document.getElementById('output');
    console.log('\n--- OUTPUT ---\n' + (outEl ? outEl.textContent : '(no output element)'));
    process.exit(0);
  }, 6000);
});
