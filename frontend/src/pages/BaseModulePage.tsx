import type { ReactNode } from 'react'

export function BaseModulePage({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="route-page module-base-page">
      <header className="module-base-header">
        <div className="module-icon">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="module-base-grid">{children}</div>
    </section>
  )
}

export function PlaceholderPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}
