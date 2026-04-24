import { navigate } from '../lib/navigate'

export function LandingView() {
  return (
    <main className="mx-auto max-w-2xl p-12 font-sans text-slate-900">
      <h1 className="text-4xl font-semibold">Loam</h1>
      <p className="mt-4 text-lg text-slate-600">
        A simple digital garden editor that stores your posts in your own remote storage. Write and publish at your own pace, with full ownership of your content.
      </p>
      <a
        className="mt-8 inline-block rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        href="/write"
        onClick={(e) => { e.preventDefault(); navigate('/write') }}
      >
        Open editor
      </a>
    </main>
  )
}
