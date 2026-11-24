# Projects

One folder per project: `projects/<name>/`

```
projects/<name>/
  source/        # client files as received (logo, images, text, requirements). Never edit these.
  brief.md       # who, what, viewer, single action, open questions
  research.md    # project-specific research: competitors, audience, references
  concepts.md    # the 10 concepts and their ranking
  briefs/        # full briefs (templates/video-brief.md) for the chosen concepts
  prompts/       # final generation prompts per scene, versioned (v1, v2…)
  log.md         # dated decisions, feedback, what worked or failed
```

**Build on past projects.** Before starting, skim every earlier `projects/*/log.md` and carry forward what worked (prompt patterns, pacing, hooks) and what didn't.

**Privacy warning:** this folder currently lives in a PUBLIC GitHub repo (wzd28/CyberNet). Do not commit client source files, unreleased client work, or anything under NDA here. See the root README.
