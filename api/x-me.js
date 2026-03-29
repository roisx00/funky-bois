// Vercel Serverless Function — fetch the authenticated user's X profile
export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'No authorization header' });

  const response = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name',
    { headers: { Authorization: auth } }
  );

  const data = await response.json();
  if (!response.ok) return res.status(400).json({ error: data });

  const { id, username, name, profile_image_url } = data.data;
  return res.json({ id, username, name, avatar: profile_image_url });
}
