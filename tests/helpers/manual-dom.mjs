// Minimal DOM for unit tests of the report dialog; real DOM coverage lives in
// diagnostics-browser.html and is run separately in a clean headless browser.
export function manualDocument() {
  const document = { activeElement: null };
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.style = {}; this.listeners = {}; this.value = ''; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    querySelector(tag) { return this.children.find(n => n.tagName === tag) || this.children.map(n => n.querySelector(tag)).find(Boolean); }
    remove() { this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
    showModal() { this.open = true; }
    close() { this.open = false; for (const fn of this.listeners.close || []) fn(); }
    focus() { document.activeElement = this; }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  }
  document.body = new Node('body');
  document.createElement = tag => new Node(tag);
  document.getElementById = id => {
    function find(node) { return node.attributes.id === id ? node : node.children.map(find).find(Boolean); }
    return find(document.body) || null;
  };
  return document;
}
