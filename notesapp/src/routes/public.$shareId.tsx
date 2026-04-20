import { createFileRoute } from '@tanstack/react-router'
import { PublicNoteView } from '../components/PublicNoteView'

export const Route = createFileRoute('/public/$shareId')({
  component: function PublicShareRoute() {
    const { shareId } = Route.useParams()
    return <PublicNoteView shareId={shareId} />
  },
})
