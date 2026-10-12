# Project documentation

Start here. These documents describe the current code, not an old project phase.

## Learning order

1. [Application walkthrough](application-walkthrough.md): one current,
   simple-English map from each screen to its routes, functions, and models.
2. [Requirements traceability](requirements-traceability.md): implemented areas,
   open requirements, and checks still needed. Do not assume everything is complete.
3. [MongoDB setup](mongodb-setup.md): local database, data location, and seed warnings.

## Team process

- [Team ownership](team-division.md): who owns each end-to-end area.
- [Git workflow](branching-strategy.md): branches, reviews, and safe updates.

## Original source documents

- [Original course requirements](project-requirements.pdf)
- [Original team division](project-division-updated.docx)

Keep these original documents as references. They are not runtime code and
must not replace the current implementation walkthrough or requirements audit.

## What to study in the project

Study `src/`, `public/js/`, `public/css/`, and the important scripts and tests.
`node_modules/` contains installed libraries, not our application code.
`.env` contains local configuration and secrets; it must never enter Git.
`public/uploads/` holds uploaded images. Personal study documents are not part
of the application repository.

There is one `test/` folder. The older area-by-area walkthroughs were
consolidated into `application-walkthrough.md`; use that file for the code map.
