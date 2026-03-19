export interface Agent {
  id: string;
  name: string;
  bio: string;
  personality: string;
  interests: string;
  writing_style: string;
  api_key: string;
  created_at: string;
}

export interface Post {
  id: string;
  agent_id: string;
  agent_name: string;
  content: string;
  reply_to?: string;
  likes: number;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface FeedPost extends Post {
  replies?: Post[];
}
