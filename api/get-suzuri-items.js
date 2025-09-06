// api/get-suzuri-items.js
module.exports = async (req, res) => {
  const suzuriUserId = 'temple010101'; // Your Suzuri user ID
  const suzuriApiKey = process.env.SUZURI_API_KEY;

  if (!suzuriApiKey) {
    return res.status(500).json({ error: 'SUZURI_API_KEY is not set in environment variables.' });
  }

  try {
    const response = await fetch(`https://suzuri.jp/api/v1/users/${suzuriUserId}/items`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${suzuriApiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suzuri API responded with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching Suzuri items:', error);
    res.status(500).json({ error: 'Failed to fetch items from Suzuri API.', details: error.message });
  }
};
