import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import matplotlib.pyplot as plt
from collections import defaultdict
import seaborn as sns
from tqdm import tqdm

def preprocess_data(csv_path):
    df = pd.read_csv(csv_path)
    
    nltk.download('punkt')
    nltk.download('stopwords')
    nltk.download('punkt_tab')
    nltk.download('averaged_perceptron_tagger')
    
    stop_words = set(stopwords.words('english'))
    stop_words -= {'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself'}
    
    def clean_text(text):
        if pd.isna(text):
            return ""
            
        text = str(text)
        
        tokens = word_tokenize(text.lower())
        tokens = [token for token in tokens if 
                 token.isalpha() and 
                 token not in stop_words and
                 len(token) > 2]
        return ' '.join(tokens)
    
    df['cleaned_response'] = df['Response'].apply(clean_text)
    
    return df

def find_optimal_topics(vectorized_data, topic_range=range(10, 13)):
    print("Finding optimal number of topics...")
    coherence_scores = []
    perplexity_scores = []
    
    for n_topics in tqdm(topic_range):
        lda = LatentDirichletAllocation(
            n_components=n_topics,
            random_state=42,
            max_iter=10,
            n_jobs=-1
        )
        lda_output = lda.fit_transform(vectorized_data)
        
        perplexity_scores.append(lda.perplexity(vectorized_data))
        coherence_scores.append(lda.score(vectorized_data))
    
    plt.figure(figsize=(12, 6))
    plt.plot(topic_range, coherence_scores, 'b-', label='Coherence Score')
    plt.plot(topic_range, perplexity_scores, 'r-', label='Perplexity Score')
    plt.xlabel('Number of Topics')
    plt.ylabel('Score')
    plt.legend()
    plt.show()
    
    optimal_idx = np.argmax(coherence_scores)
    optimal_topics = list(topic_range)[optimal_idx]
    print(f"\nOptimal number of topics: {optimal_topics}")
    
    return coherence_scores, perplexity_scores, optimal_topics

def analyze_by_category(df):
    results = {}
    for category in df['Category'].unique():
        category_df = df[df['Category'] == category]
        
        vectorizer = CountVectorizer(max_df=0.95, min_df=2)
        doc_term_matrix = vectorizer.fit_transform(category_df['cleaned_response'])
        
        coherence, perplexity, optimal_topics = find_optimal_topics(doc_term_matrix)
        
        results[category] = {
            'vectorizer': vectorizer,
            'doc_term_matrix': doc_term_matrix,
            'coherence_scores': coherence,
            'perplexity_scores': perplexity,
            'optimal_topics': optimal_topics
        }
    
    return results

def train_lda_model(doc_term_matrix, n_topics=10):
    print(f"Training LDA model with {n_topics} topics...")
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        random_state=42,
        max_iter=10,
        n_jobs=-1
    )
    doc_topics = lda.fit_transform(doc_term_matrix)
    return lda, doc_topics

def get_top_words_per_topic(lda_model, vectorizer, n_words=15):
    feature_names = vectorizer.get_feature_names_out()
    topics = []
    
    print("\nTop words for each topic:")
    print("="*50)
    
    for topic_idx, topic in enumerate(lda_model.components_):
        top_word_indices = topic.argsort()[:-n_words-1:-1]
        top_words = [feature_names[i] for i in top_word_indices]
        topic_weight = topic[top_word_indices]
        
        topic_weight = topic_weight / topic_weight.sum()
        
        topic_dict = {
            'topic_id': topic_idx,
            'words': top_words,
            'weights': topic_weight,
            'coherence': np.mean(topic_weight)
        }
        topics.append(topic_dict)
        
        print(f"\nTopic {topic_idx}:")
        print("-"*20)
        for word, weight in zip(top_words, topic_weight):
            print(f"{word}: {weight:.3f}")
    
    return topics

def analyze_demographic_bias(df, demographic_col, doc_topics, topics):
    """Analyze topic distribution across demographic groups with relative importance"""
    demographic_groups = df[demographic_col].unique()
    topic_distributions = defaultdict(list)
    
    for group in demographic_groups:
        group_mask = df[demographic_col] == group
        group_topics = doc_topics[group_mask]
        if len(group_topics) > 0:
            avg_distribution = group_topics.mean(axis=0)
            topic_distributions[group] = avg_distribution
    
    topic_dist_df = pd.DataFrame(topic_distributions).T
    topic_dist_df.columns = [f'Topic {i}' for i in range(topic_dist_df.shape[1])]

    topic_means = topic_dist_df.mean()
    topic_stds = topic_dist_df.std()
    relative_importance = (topic_dist_df - topic_means) / topic_stds
    
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(15, 16))
    
    sns.heatmap(topic_dist_df, annot=True, cmap='YlOrRd', fmt='.3f', ax=ax1)
    ax1.set_title(f'Raw Topic Distribution Across {demographic_col} Groups')
    ax1.set_ylabel(demographic_col)
    
    sns.heatmap(relative_importance, annot=True, cmap='RdBu_r', fmt='.2f', 
                center=0, ax=ax2, vmin=-2, vmax=2)
    ax2.set_title(f'Relative Topic Importance Across {demographic_col} Groups\n(Standard deviations from mean)')
    ax2.set_ylabel(demographic_col)
    
    topic_labels = []
    for i in range(len(topics)):
        top_words = ', '.join(topics[i]['words'][:3])
        topic_labels.append(f'Topic {i}\n({top_words})')
    
    ax1.set_xticklabels(topic_labels, rotation=45, ha='right')
    ax2.set_xticklabels(topic_labels, rotation=45, ha='right')
    
    plt.tight_layout()
    plt.show()
    
    print("\nNotable topic biases:")
    threshold = 1.0
    for topic in relative_importance.columns:
        notable_groups = relative_importance[relative_importance[topic].abs() > threshold][topic]
        if len(notable_groups) > 0:
            print(f"\n{topic}:")
            for group, score in notable_groups.items():
                direction = "more likely" if score > 0 else "less likely"
                print(f"  {group} is {direction} ({score:.2f} std) to discuss this topic")
    
    return topic_distributions, relative_importance

def analyze_intersectional_bias(df, doc_topics, demographic_cols=['Race', 'Gender']):
    """Analyze intersectional bias across multiple demographic dimensions"""
    df['demographic_group'] = df[demographic_cols].apply(lambda x: '_'.join(x), axis=1)
    
    groups = df['demographic_group'].unique()
    topic_distributions = defaultdict(list)
    
    for group in groups:
        group_mask = df['demographic_group'] == group
        group_topics = doc_topics[group_mask]
        avg_distribution = group_topics.mean(axis=0)
        topic_distributions[group] = avg_distribution
    
    topic_dist_df = pd.DataFrame(topic_distributions).T
    topic_dist_df.columns = [f'Topic {i}' for i in range(topic_dist_df.shape[1])]
    
    plt.figure(figsize=(15, 10))
    sns.heatmap(topic_dist_df, annot=True, cmap='YlOrRd', fmt='.3f')
    plt.title('Topic Distribution Across Intersectional Groups')
    plt.ylabel('Demographic Groups')
    plt.tight_layout()
    plt.show()
    
    return topic_distributions

def map_prompts_to_topics(df, doc_topics, topics):
    """
    Maps each prompt to its single most dominant topic
    
    Parameters:
    - df: DataFrame containing the prompts
    - doc_topics: Topic distribution matrix from LDA (documents × topics)
    - topics: List of topic dictionaries containing words and weights
    
    Returns:
    - DataFrame with prompt-topic mappings
    """
    dominant_topics = np.argmax(doc_topics, axis=1)
    dominant_probs = np.max(doc_topics, axis=1)
    
    result_df = pd.DataFrame({
        'Prompt': df['Prompt'],
        'Response': df['Response'],
        'Gender': df['Gender'],
        'Race': df['Race'],
        'Dominant_Topic': dominant_topics,
        'Topic_Probability': dominant_probs,
        'Topic_Keywords': [', '.join(topics[topic_idx]['words'][:5]) for topic_idx in dominant_topics],
    })
    
    result_df['Topic_Description'] = result_df.apply(
        lambda x: f"Topic {x['Dominant_Topic']} ({x['Topic_Probability']:.2f}): {x['Topic_Keywords']}", 
        axis=1
    )
    
    return result_df

def main():
    print("Loading and preprocessing data...")
    df = preprocess_data('processed_data (1).csv')
    
    categories = df['Category'].unique()
    
    for category in categories:
        print(f"\n{'='*50}")
        print(f"Analyzing category: {category}")
        print(f"{'='*50}")
        
        category_df = df[df['Category'] == category]
        print(f"Number of documents in this category: {len(category_df)}")
        
        print("Creating document-term matrix...")
        vectorizer = CountVectorizer(max_df=0.95, min_df=2)
        doc_term_matrix = vectorizer.fit_transform(category_df['cleaned_response'])
        print(f"Vocabulary size: {len(vectorizer.get_feature_names_out())}")
        
        coherence, perplexity, optimal_topics = find_optimal_topics(doc_term_matrix)
        
        lda_model, doc_topics = train_lda_model(doc_term_matrix, n_topics=optimal_topics)
        
        topics = get_top_words_per_topic(lda_model, vectorizer)
        
        prompt_topic_mapping = map_prompts_to_topics(category_df, doc_topics, topics)

        output_filename = f'topic_mapping_{category.lower().replace(" ", "_")}.csv'
        prompt_topic_mapping.to_csv(output_filename, index=False)
        print(f"\nSaved prompt-topic mapping to {output_filename}")
        
        print("\nAnalyzing demographic distributions...")
        race_distributions = analyze_demographic_bias(category_df, 'Race', doc_topics, topics)
        gender_distributions = analyze_demographic_bias(category_df, 'Gender', doc_topics, topics)
        
        input("\nPress Enter to continue to next category...")

if __name__ == "__main__":
    main()