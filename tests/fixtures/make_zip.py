import json, zipfile, random, time
random.seed(4)
now=int(time.time())
def ts(days_ago, hour=None):
    t=now-days_ago*86400
    if hour is not None: t=t-(t%86400)+hour*3600
    return t
users=[f"user_{i}" for i in range(1,41)]
def sld(u,t): return {"title":"","string_list_data":[{"href":f"https://www.instagram.com/{u}","value":u,"timestamp":t}]}
followers=[sld(u,ts(random.randint(1,900))) for u in users[:25]]
following=[sld(u,ts(random.randint(1,900))) for u in users[10:38]]
def tit(u,t): return {"title":u,"string_list_data":[{"href":"https://www.instagram.com/p/x","timestamp":t}]}
liked=[tit(random.choice(users[:12]),ts(random.randint(1,300),random.choice([21,22,23,13]))) for _ in range(300)]
comments=[{"string_map_data":{"Comment":{"value":"QuÃ© bueno"},"Media Owner":{"value":random.choice(users[:6])},"Time":{"timestamp":ts(random.randint(1,300),20)}}} for _ in range(40)]
searches=[{"string_map_data":{"Search":{"value":random.choice(users[:5])},"Time":{"timestamp":ts(random.randint(1,100))}}} for _ in range(20)]
saved={"saved_saved_media":[{"title":random.choice(users[:8]),"string_map_data":{"Saved on":{"timestamp":ts(random.randint(1,200))}}} for _ in range(15)]}
logins=[{"string_map_data":{"Time":{"timestamp":ts(random.randint(1,400),random.choice([8,9,22]))},"IP Address":{"value":random.choice(["1.1.1.1","2.2.2.2"])},"User Agent":{"value":"Instagram 300.0 Android (31/12)"}}} for _ in range(50)]
posts=[{"media":[{"creation_timestamp":ts(i*15+3,19)}]} for i in range(20)]
reels=[{"media":[{"creation_timestamp":ts(i*40+1,18)}]} for i in range(5)]
stories=[{"creation_timestamp":ts(i*5+1,12)} for i in range(30)]
pers=[{"string_map_data":{"Username":{"value":"yo_mismo"},"Name":{"value":"DoÃ± Se"},"Private Account":{"value":"false"}}}]
changes=[{"string_map_data":{"Changed":{"value":"Username"},"Previous Value":{"value":"a"},"New Value":{"value":"yo_mismo"},"Change Date":{"timestamp":ts(200)}}}]
unf={"relationships_unfollowed_users":[sld("user_3",ts(5)),sld("user_39",ts(9))]}
pend={"relationships_permanent_follow_requests":[sld("user_40",ts(80))]}
blocked={"relationships_blocked_users":[{"title":"user_38","string_list_data":[{"href":"x","timestamp":ts(3)}]}]}
hasht={"relationships_following_hashtags":[{"title":"","string_list_data":[{"value":"golf","timestamp":ts(3)}]}]}
adv={"ig_custom_audiences_all_types":[{"advertiser_name":"Tienda A"},{"advertiser_name":"Tienda B"}]}
def msgs(name, other, n, last_me):
    ms=[]
    for i in range(n):
        sender="DoÃ± Se" if (i%2==0)==last_me else other
        ms.append({"sender_name":sender,"timestamp_ms":(now-(n-i)*86400*3)*1000,"content":"hola"})
    ms.reverse()
    return {"participants":[{"name":other},{"name":"DoÃ± Se"}],"messages":ms,"title":other}
with zipfile.ZipFile("insta.zip","w") as z:
    z.writestr("connections/followers_and_following/followers_1.json",json.dumps(followers))
    z.writestr("connections/followers_and_following/following.json",json.dumps({"relationships_following":following}))
    z.writestr("connections/followers_and_following/following_hashtags.json",json.dumps(hasht))
    z.writestr("connections/followers_and_following/recently_unfollowed_profiles.json",json.dumps(unf))
    z.writestr("connections/followers_and_following/pending_follow_requests.json",json.dumps(pend))
    z.writestr("connections/followers_and_following/blocked_profiles.json",json.dumps(blocked))
    z.writestr("your_instagram_activity/likes/liked_posts.json",json.dumps({"likes_media_likes":liked}))
    z.writestr("your_instagram_activity/comments/post_comments_1.json",json.dumps(comments))
    z.writestr("logged_information/recent_searches/account_searches.json",json.dumps({"searches_user":searches}))
    z.writestr("your_instagram_activity/saved/saved_posts.json",json.dumps(saved))
    z.writestr("security_and_login_information/login_and_account_creation/login_activity.json",json.dumps({"account_history_login_history":logins}))
    z.writestr("your_instagram_activity/media/posts_1.json",json.dumps(posts))
    z.writestr("your_instagram_activity/media/reels.json",json.dumps({"ig_reels_media":[{"media":r["media"]} for r in reels]}))
    z.writestr("your_instagram_activity/media/stories.json",json.dumps({"ig_stories":stories}))
    z.writestr("personal_information/personal_information/personal_information.json",json.dumps({"profile_user":pers}))
    z.writestr("personal_information/personal_information/profile_changes.json",json.dumps({"profile_profile_change":changes}))
    z.writestr("ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.json",json.dumps(adv))
    for i,u in enumerate(users[:12]):
        z.writestr(f"your_instagram_activity/messages/inbox/{u}_123{i}/message_1.json",json.dumps(msgs("x",u,10+i*20,i%2==0)))
print("zip ok")
