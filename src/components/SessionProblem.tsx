import { useAuth } from "@/context/AuthContext";
export default function SessionProblem() {
  const { authError, retrySession, signOut } = useAuth();
  return <div role="alert" style={{maxWidth:420,margin:"12vh auto",padding:24,textAlign:"center"}}><h2>Unable to open your account</h2><p>{authError || "Your account is not available. Please contact support."}</p><button onClick={() => void retrySession()}>Retry</button><p><button onClick={() => void signOut()}>Sign out</button></p></div>;
}
