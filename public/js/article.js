// Prepare the comment form for an AJAX implementation.
(() => {
  // Find the form that will later submit comments through the article API.
  const commentForm = document.querySelector("#comment-form");
  // Keep the placeholder form from reloading the page until the comment API is connected.
  commentForm?.addEventListener("submit", (event) => event.preventDefault());
})();
