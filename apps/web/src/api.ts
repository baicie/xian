import type { Task } from './board'

export type DocumentKind = 'ARCHITECTURE' | 'REQUIREMENT' | 'DESIGN' | 'MEETING' | 'RETROSPECTIVE'
export type WorkspaceDocument = { id:string;projectId:string|null;title:string;kind:DocumentKind;status:'DRAFT'|'PUBLISHED'|'ARCHIVED';content:string;version:number;createdAt:string;updatedAt:string }
export type DocumentSummary = Omit<WorkspaceDocument,'content'|'createdAt'> & { projectName:string|null;updatedByName:string }
export type PlanItem={id:string;position:number;title:string;description:string;kind:Task['kind'];priority:'HIGH'|'MEDIUM'|'LOW';taskId:string|null}
export type ProjectPlan={id:string;projectId:string;title:string;goal:string;status:'DRAFT'|'APPLIED';source:string;version:number;items:PlanItem[];appliedAt:string|null;updatedAt:string}
export type PlanSummary=Omit<ProjectPlan,'items'|'appliedAt'> & {projectName:string;itemCount:number}

const base='/api/v1'
let csrf=''
async function request<T>(path:string,init:RequestInit={}){const response=await fetch(base+path,{...init,credentials:'include',headers:{'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{}),...init.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'请求失败');return data as T}
async function upload<T>(path:string,file:File){const body=new FormData();body.append('file',file);const response=await fetch(base+path,{method:'POST',body,credentials:'include',headers:csrf?{'x-csrf-token':csrf}:{}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'上传失败');return data as T}
export const api={
  async me(){const data=await request<{user:{id:string;name:string};csrfToken:string}>('/auth/me');csrf=data.csrfToken;return data},
  async login(email:string,password:string){const data=await request<{user:{id:string;name:string};csrfToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});csrf=data.csrfToken;return data},
  register(input:{email:string;name:string;password:string;workspaceName:string}){return request('/auth/register',{method:'POST',body:JSON.stringify(input)})},
  logout(){return request('/auth/logout',{method:'POST'})},
  workspaces(){return request<{id:string;name:string;slug:string;role:string}[]>('/workspaces')},
  createWorkspace(name:string){return request<{id:string;name:string;slug:string}>('/workspaces',{method:'POST',body:JSON.stringify({name})})},
  projects(workspaceId:string){return request<{id:string;name:string;code:string;color:string}[]>(`/workspaces/${workspaceId}/projects`)},
  createProject(workspaceId:string,input:{name:string;code:string}){return request(`/workspaces/${workspaceId}/projects`,{method:'POST',body:JSON.stringify({...input,description:'',color:'#2367d1'})})},
  deleteProject(workspaceId:string,projectId:string){return request(`/workspaces/${workspaceId}/projects/${projectId}`,{method:'DELETE'})},
  columns(workspaceId:string,projectId:string){return request<{id:string;name:string;color:string}[]>(`/workspaces/${workspaceId}/projects/${projectId}/columns`)},
  async tasks(workspaceId:string,projectId:string,archived=false){const result=await request<{data:Array<{id:string;number:number;projectId:string;columnId:string;title:string;description:string;kind:Task['kind'];priority:'HIGH'|'MEDIUM'|'LOW';dueDate:string|null;version:number;assignees:{id:string;name:string}[];labels:string[]}>}>(`/workspaces/${workspaceId}/tasks?projectId=${projectId}&archived=${archived}`);return result.data.map((task):Task=>({id:task.id,number:task.number,projectId:task.projectId,title:task.title,description:task.description,kind:task.kind,column:task.columnId,priority:{HIGH:'高',MEDIUM:'中',LOW:'低'}[task.priority] as Task['priority'],assignee:task.assignees[0]?.name??'未分配',assigneeId:task.assignees[0]?.id??'',due:task.dueDate??'',tags:task.labels,version:task.version}))},
  members(workspaceId:string){return request<{id:string;name:string;email:string;role:string;disabledAt:string|null}[]>(`/workspaces/${workspaceId}/members`)},
  addMember(workspaceId:string,input:{email:string;role:'ADMIN'|'MEMBER'|'VIEWER'}){return request(`/workspaces/${workspaceId}/members`,{method:'POST',body:JSON.stringify(input)})},
  createTask(workspaceId:string,task:Task){return request(`/workspaces/${workspaceId}/tasks`,{method:'POST',body:JSON.stringify({projectId:task.projectId,columnId:task.column,title:task.title,description:task.description,kind:task.kind,priority:{高:'HIGH',中:'MEDIUM',低:'LOW'}[task.priority],assigneeIds:task.assigneeId?[task.assigneeId]:[],dueDate:task.due||null,labels:task.tags})})},
  updateTask(workspaceId:string,task:Task){return request<{id:string;version:number}>(`/workspaces/${workspaceId}/tasks/${task.id}`,{method:'PATCH',body:JSON.stringify({title:task.title,description:task.description,kind:task.kind,columnId:task.column,priority:{高:'HIGH',中:'MEDIUM',低:'LOW'}[task.priority],assigneeIds:task.assigneeId?[task.assigneeId]:[],dueDate:task.due||null,labels:task.tags,version:task.version})})},
  documents(workspaceId:string){return request<DocumentSummary[]>(`/workspaces/${workspaceId}/documents`)},
  document(workspaceId:string,documentId:string){return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents/${documentId}`)},
  createDocument(workspaceId:string,input:{title:string;kind?:DocumentKind;projectId?:string|null;content?:string}){return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents`,{method:'POST',body:JSON.stringify(input)})},
  updateDocument(workspaceId:string,documentId:string,input:Partial<Pick<WorkspaceDocument,'title'|'kind'|'status'|'content'|'projectId'>> & {version:number;changeNote?:string}){return request<WorkspaceDocument>(`/workspaces/${workspaceId}/documents/${documentId}`,{method:'PATCH',body:JSON.stringify(input)})},
  documentVersions(workspaceId:string,documentId:string){return request<{id:string;version:number;title:string;status:WorkspaceDocument['status'];changeNote:string;createdAt:string;createdByName:string}[]>(`/workspaces/${workspaceId}/documents/${documentId}/versions`)},
  plans(workspaceId:string){return request<PlanSummary[]>(`/workspaces/${workspaceId}/plans`)},
  plan(workspaceId:string,planId:string){return request<ProjectPlan>(`/workspaces/${workspaceId}/plans/${planId}`)},
  createPlan(workspaceId:string,input:{projectId:string;title:string;goal:string;items:{title:string;description?:string;kind?:Task['kind'];priority?:PlanItem['priority']}[]}){return request<ProjectPlan>(`/workspaces/${workspaceId}/plans`,{method:'POST',body:JSON.stringify(input)})},
  updatePlan(workspaceId:string,planId:string,input:{title?:string;goal?:string;items?:Omit<PlanItem,'id'|'position'|'taskId'>[];version:number}){return request<ProjectPlan>(`/workspaces/${workspaceId}/plans/${planId}`,{method:'PATCH',body:JSON.stringify(input)})},
  applyPlan(workspaceId:string,planId:string){return request<{status:'APPLIED';alreadyApplied:boolean;taskIds:string[]}>(`/workspaces/${workspaceId}/plans/${planId}/apply`,{method:'POST'})},
  mcpTokens(workspaceId:string){return request<{id:string;name:string;scopes:string[];lastUsedAt:string|null;createdAt:string}[]>(`/workspaces/${workspaceId}/mcp-tokens`)},
  createMcpToken(workspaceId:string,input:{name:string;write:boolean}){return request<{id:string;name:string;scopes:string[];createdAt:string;token:string}>(`/workspaces/${workspaceId}/mcp-tokens`,{method:'POST',body:JSON.stringify(input)})},
  revokeMcpToken(workspaceId:string,tokenId:string){return request(`/workspaces/${workspaceId}/mcp-tokens/${tokenId}`,{method:'DELETE'})},
  async exportWorkspace(workspaceId:string){const response=await fetch(`${base}/workspaces/${workspaceId}/export`,{credentials:'include'});if(!response.ok)throw new Error('导出失败');return{blob:await response.blob(),filename:response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'workspace.taskharbor.zip'}},
  previewImport(file:File){return upload<{workspaceName:string;suggestedName:string;counts:{members:number;projects:number;tasks:number;documents:number;plans:number}}>('/workspaces/import/preview',file)},
  importWorkspace(file:File){return upload<{id:string;name:string}>('/workspaces/import',file)},
  githubIntegration(workspaceId:string){return request<{projectId:string;owner:string;repo:string;tokenLast4:string;updatedAt:string}|null>(`/workspaces/${workspaceId}/integrations/github`)},
  configureGitHub(workspaceId:string,input:{repoUrl:string;token:string;projectId:string}){return request(`/workspaces/${workspaceId}/integrations/github`,{method:'PUT',body:JSON.stringify(input)})},
  removeGitHub(workspaceId:string){return request(`/workspaces/${workspaceId}/integrations/github`,{method:'DELETE'})},
  pushGitHub(workspaceId:string){return request<{tasks:number;documents:number}>(`/workspaces/${workspaceId}/integrations/github/push`,{method:'POST'})},
  pullGitHub(workspaceId:string){return request<{imported:number;conflicts:number}>(`/workspaces/${workspaceId}/integrations/github/pull`,{method:'POST'})},
  githubConflicts(workspaceId:string){return request<{id:string;entityId:string;remoteRef:string;remoteData:{title:string;description:string};createdAt:string;localTitle:string}[]>(`/workspaces/${workspaceId}/integrations/github/conflicts`)},
  resolveGitHubConflict(workspaceId:string,conflictId:string,resolution:'KEEP_LOCAL'|'USE_GITHUB'){return request(`/workspaces/${workspaceId}/integrations/github/conflicts/${conflictId}/resolve`,{method:'POST',body:JSON.stringify({resolution})})},
}
