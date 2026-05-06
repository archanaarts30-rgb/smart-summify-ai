// Runs on every page — extracts readable text on demand

function extractPageText(): string {
  // Remove noisy elements
  const remove = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript', '[aria-hidden="true"]'];
  const clone = document.body.cloneNode(true) as HTMLElement;
  remove.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

  // Prefer article/main content
  const article = clone.querySelector('article, main, [role="main"]');
  const source = article || clone;

  return (source.innerText || source.textContent || '')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 50000); // Cap at 50k chars to stay within token limits
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse({
      content: extractPageText(),
      url: window.location.href,
      title: document.title,
    });
  }
  return true;
});
