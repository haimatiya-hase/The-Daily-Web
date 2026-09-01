// Prepare the comment form for an AJAX implementation.
(() => {
  const commentForm = document.querySelector("#comment-form");
  commentForm?.addEventListener("submit", (event) => event.preventDefault());
})();
