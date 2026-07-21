import { MarkdownPlugin } from '@platejs/markdown'
import { Bold, Italic, Underline } from 'lucide-react'
import { Plate, usePlateEditor } from 'platejs/react'
import { BasicNodesKit } from '@/components/editor/plugins/basic-nodes-kit'
import { Editor, EditorContainer } from '@/components/ui/editor'
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button'
import { Toolbar } from '@/components/ui/toolbar'

export default function MarkdownEditor({ value, onChange, disabled=false }:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const editor=usePlateEditor({
    plugins:[...BasicNodesKit,MarkdownPlugin],
    value:editor=>editor.getApi(MarkdownPlugin).markdown.deserialize(value),
  })
  return <Plate editor={editor} onValueChange={({value:next})=>onChange(editor.getApi(MarkdownPlugin).markdown.serialize({value:next}))}>
    <Toolbar className="document-editor-toolbar">
      <MarkToolbarButton nodeType="bold" aria-label="粗体"><Bold /></MarkToolbarButton>
      <MarkToolbarButton nodeType="italic" aria-label="斜体"><Italic /></MarkToolbarButton>
      <MarkToolbarButton nodeType="underline" aria-label="下划线"><Underline /></MarkToolbarButton>
      <span>支持 Markdown 粘贴与导出</span>
    </Toolbar>
    <EditorContainer className="document-editor-surface">
      <Editor variant="none" disabled={disabled} placeholder="记录背景、约束、方案与关键决策…" />
    </EditorContainer>
  </Plate>
}
