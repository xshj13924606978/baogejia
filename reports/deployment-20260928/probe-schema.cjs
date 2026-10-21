(async()=>{
 const url=process.env.COZE_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const response=await fetch(url+'/rest/v1/users?select=id,role,status,deleted_at,session_version&limit=0',{method:'HEAD',headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
 console.log(JSON.stringify({users_auth_columns_status:response.status,session_secret_present:!!process.env.SESSION_TOKEN_SECRET}));
 if(!response.ok)process.exitCode=1;
})().catch(()=>{console.log('SCHEMA_PROBE_FAILED');process.exitCode=1});
