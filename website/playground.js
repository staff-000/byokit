import { playgroundExamples } from './playground-examples.js';
const $ = (selector) => document.querySelector(selector);
const editor = $('#playground-code'),
  output = $('#playground-output'),
  status = $('#playground-status');
let generation = 0,
  frame = null,
  timer = null,
  active = false,
  runtimePromise;
const frameDocument = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
let worker;
onmessage=event=>{
 if(event.source!==parent||event.data?.kind!=='byokit-playground-run')return;
 const {source,code,id}=event.data;
 worker?.terminate();
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 worker=new Worker(url);URL.revokeObjectURL(url);
 worker.onmessage=event=>parent.postMessage(event.data,'*');
 worker.onerror=()=>parent.postMessage({kind:'byokit-playground',type:'error',id,text:'The playground worker could not start.'},'*');
 worker.postMessage({code,id});
};
<\/script>`;
function finish(message, state = 'ready') {
  active = false;
  clearTimeout(timer);
  frame?.remove();
  frame = null;
  $('#playground-run').disabled = false;
  $('#playground-stop').disabled = true;
  status.textContent = message;
  status.dataset.state = state;
}
function stop(message = 'Stopped. Edit your code and run again.') {
  generation++;
  finish(message);
}
function chooseExample() {
  stop('Ready. Run this example or edit it first.');
  editor.value = playgroundExamples[$('#playground-example').value].code;
  output.textContent = 'Your console output will appear here.';
}
async function run() {
  if (active) return;
  if (!editor.value.trim()) {
    status.textContent = 'Enter some JavaScript first.';
    return;
  }
  if (editor.value.length > 30000) {
    status.textContent = 'Keep your example under 30,000 characters.';
    return;
  }
  const id = ++generation,
    code = editor.value;
  active = true;
  $('#playground-run').disabled = true;
  $('#playground-stop').disabled = false;
  output.textContent = '';
  status.textContent = 'Loading the offline runtime…';
  status.dataset.state = 'running';
  try {
    runtimePromise ??= import('./playground-runtime.js');
    const { workerSource } = await runtimePromise;
    if (id !== generation || !active) return;
    frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', 'Isolated JavaScript playground');
    frame.onload = () => {
      if (id !== generation || !active) return;
      status.textContent = 'Running…';
      frame.contentWindow.postMessage(
        { kind: 'byokit-playground-run', id, source: workerSource, code },
        '*',
      );
    };
    frame.srcdoc = frameDocument;
    document.body.append(frame);
    timer = setTimeout(() => {
      if (id === generation) stop('Stopped after 3 seconds. Shorten your code and try again.');
    }, 3000);
  } catch {
    if (id === generation) {
      runtimePromise = null;
      finish('The playground could not load. Check your connection and try again.', 'error');
    }
  }
}
window.addEventListener('message', (event) => {
  if (!active || !frame || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || data.kind !== 'byokit-playground' || data.id !== generation) return;
  if (data.type === 'log' && typeof data.text === 'string') {
    const available = 26000 - output.textContent.length;
    if (available > 0)
      output.textContent += (output.textContent ? '\n\n' : '') + data.text.slice(0, available);
  } else if (data.type === 'done') {
    if (!output.textContent)
      output.textContent = 'No console output. Use console.log() or return a value.';
    finish('Finished. Output comes from the real byokit catalog.', 'success');
  } else if (data.type === 'error') {
    output.textContent +=
      (output.textContent ? '\n\n' : '') + String(data.text || 'Execution failed.').slice(0, 2000);
    finish('JavaScript error. Edit your code and try again.', 'error');
  }
});
for (const [value, example] of Object.entries(playgroundExamples)) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = example.label;
  $('#playground-example').append(option);
}
$('#playground-example').addEventListener('change', chooseExample);
$('#playground-run').addEventListener('click', run);
$('#playground-stop').addEventListener('click', () => stop());
$('#playground-reset').addEventListener('click', chooseExample);
$('#playground-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    status.textContent = 'JavaScript copied.';
  } catch {
    editor.focus();
    editor.select();
    status.textContent = 'Select and copy the JavaScript.';
  }
});
editor.addEventListener('input', () => {
  if (active) stop('Code changed. Run again to use your edits.');
});
editor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run();
  }
});
window.addEventListener('pagehide', () => stop());
chooseExample();
