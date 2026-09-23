import { requireAdminManager } from '@/lib/server/auth';
import { invitationSchema } from '@/lib/server/access-contracts';
import { checkOrigin,failure,HttpError,json,readJson } from '@/lib/server/http';
import { createServiceClient } from '@/lib/server/service-client';

export async function POST(request:Request){
  try{
    checkOrigin(request);const {client}=await requireAdminManager();const input=await readJson(request,invitationSchema);const service=createServiceClient();
    const {data:pending,error}=await client.rpc('request_admin_invitation',{p_email:input.email,p_role:input.role,p_permissions:input.permissions,p_can_manage_admins:input.canManageAdmins});if(error)throw error;
    let userId:string|null=pending.targetUserId;let providerError:string|null=null;
    if(!userId){
      const configured=process.env.NEXT_PUBLIC_SITE_URL??new URL(request.url).origin;
      const redirectTo=new URL('/auth/accept',configured).href;
      const invited=await service.auth.admin.inviteUserByEmail(input.email,{redirectTo});
      if(invited.error)providerError='auth_invitation_failed';else userId=invited.data.user?.id??null;
      if(!userId&&!providerError)providerError='auth_identity_missing';
    }
    const completed=await service.rpc('finish_admin_invitation',{p_invitation_id:pending.id,p_user_id:userId,p_error_code:providerError});
    if(completed.error){await service.rpc('finish_admin_invitation',{p_invitation_id:pending.id,p_user_id:null,p_error_code:'grant_rejected'});throw completed.error;}
    if(completed.data.status==='failed')throw new HttpError(409,'The invitation could not be completed. The request was audited; check email delivery and current permissions before trying again.');
    return json({invitation:{...completed.data,email:pending.email,role:input.role}},201);
  }catch(error){return failure(error);}
}
