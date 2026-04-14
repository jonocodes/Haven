import { createFileRoute } from '@tanstack/react-router'
import { NoteEditor } from '../components/NoteEditor'

export const Route = createFileRoute('/notes/$id')({
  component: function NoteRoute() {
    const { id } = Route.useParams()
    return <NoteEditor noteId={id} />
  },
})
