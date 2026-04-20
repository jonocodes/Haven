import { createFileRoute } from '@tanstack/react-router'
import { NoteList } from '../components/NoteList'

export const Route = createFileRoute('/')({ component: NoteList })
