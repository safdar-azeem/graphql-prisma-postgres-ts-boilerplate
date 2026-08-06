# Example queues (not loaded)

`notification.queue.example.ts` and `data-export.queue.example.ts` are templates only.

They are **not** imported by `src/queues/index.ts` and do not start workers.

Copy a file into `src/queues/`, wire it into `startQueues()`, and implement real processing before enabling in production.
